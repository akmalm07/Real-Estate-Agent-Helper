import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, oauthAccounts, leads } from '../db/schema.js';
import { msalClient } from './outlook.js';
import {
  checkEmails,
  checkDuplicates,
  sendInitialMessages,
} from './email-webhook-helpers.js';

const outlookEmailWebhook = Router();

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

/* Exchanges a stored refresh token for a fresh access token using MSAL.
 *
 * Parameters:
 *   refreshToken: string — the stored Microsoft OAuth refresh token
 *
 * Returns:
 *   string — a valid access token for Microsoft Graph API calls
 */
async function getAccessToken(refreshToken) {
  const tokenResponse = await msalClient.acquireTokenByRefreshToken({
    refreshToken,
    scopes: process.env.MICROSOFT_SCOPES.split(','),
  });

  return tokenResponse.accessToken;
}

/* Fetches the full message object from Microsoft Graph for a given message ID.
 *
 * Parameters:
 *   accessToken: string — a valid Microsoft Graph access token
 *   messageId:   string — the Outlook message ID
 *
 * Returns:
 *   object — the raw Microsoft Graph message object
 */
async function fetchOutlookMessage(accessToken, messageId) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch message ${messageId}: ${await response.text()}`);
  }

  return response.json();
}

/* Normalizes a Microsoft Graph message object into the shared email format
 * expected by checkEmails() in email-webhook-helpers.js.
 *
 * Microsoft Graph messages use a different shape than Gmail payloads, so we
 * map the relevant fields into a common structure:
 *   {
 *     id:      string,
 *     payload: {
 *       headers:  [{ name, value }],
 *       bodyText: string,   // pre-extracted plain text
 *     }
 *   }
 *
 * Parameters:
 *   message: object — raw Microsoft Graph message object
 *
 * Returns:
 *   object — normalized email object
 */
function normalizeOutlookMessage(message) {
  const headers = [
    { name: 'From', value: message.from?.emailAddress?.address ?? '' },
    { name: 'Subject', value: message.subject ?? '' },
    { name: 'Message-ID', value: message.internetMessageId ?? '' },
    { name: 'In-Reply-To', value: message.internetMessageHeaders?.find(
      (h) => h.name.toLowerCase() === 'in-reply-to'
    )?.value ?? '' },
  ];

  // Prefer plain text body; fall back to HTML stripped of tags
  let bodyText = '';
  if (message.body?.contentType === 'text') {
    bodyText = message.body.content ?? '';
  } else if (message.body?.contentType === 'html') {
    bodyText = (message.body.content ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return {
    id: message.id,
    payload: {
      headers,
      bodyText,
    },
  };
}

/* Reads new Outlook messages for a user using the Microsoft Graph delta query.
 * Fetches only messages received since the last recorded delta link, then
 * updates the stored delta link in the database.
 *
 * If no delta link is stored yet, bootstraps by fetching the current delta
 * link without returning any messages (so the next notification will work).
 *
 * Parameters:
 *   oauth:       object — the oauth_accounts DB row (must have refreshToken, lastDeltaLink, id)
 *
 * Returns:
 *   object[] — array of normalized email objects ready for checkEmails()
 */
async function readNewOutlookEmails(oauth) {
  const accessToken = await getAccessToken(oauth.refreshToken);

  let deltaUrl = oauth.lastDeltaLink
    ?? 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$select=id,subject,from,body,internetMessageId,internetMessageHeaders,receivedDateTime';

  const messages = [];
  let nextLink = deltaUrl;
  let newDeltaLink = null;

  // Page through all delta results
  while (nextLink) {
    const response = await fetch(nextLink, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'odata.maxpagesize=50',
      },
    });

    if (!response.ok) {
      throw new Error(`Graph delta query failed: ${await response.text()}`);
    }

    const data = await response.json();

    for (const msg of data.value ?? []) {
      messages.push(normalizeOutlookMessage(msg));
    }

    if (data['@odata.deltaLink']) {
      newDeltaLink = data['@odata.deltaLink'];
      nextLink = null;
    } else {
      nextLink = data['@odata.nextLink'] ?? null;
    }
  }

  // Persist the new delta link so the next notification starts from here
  if (newDeltaLink) {
    await db
      .update(oauthAccounts)
      .set({ lastDeltaLink: newDeltaLink })
      .where(eq(oauthAccounts.id, oauth.id));
  }

  return messages;
}

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/

/* This route handles the Microsoft Graph change notification validation
 * handshake. When a new subscription is created, Graph sends a GET request
 * with a validationToken query parameter that must be echoed back as plain
 * text with a 200 status.
 *
 * Called by:
 *   Microsoft Graph subscription validation
 *
 * Query:
 *   validationToken: string
 *
 * Response:
 *   200 — plain text echo of validationToken
 */
outlookEmailWebhook.get('/outlook', (req, res) => {
  const validationToken = req.query.validationToken;

  if (validationToken) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(validationToken);
  }

  return res.sendStatus(400);
});

/* This route is called by Microsoft Graph when a new Outlook message arrives
 * for a subscribed inbox. It verifies the client state secret, fetches new
 * messages via the Graph delta API, parses them for leads, deduplicates,
 * inserts new leads into the database, and sends an initial outreach message.
 *
 * Called by:
 *   Microsoft Graph change notifications (webhook POST)
 *
 * Headers:
 *   None required beyond standard Graph notification headers
 *
 * Request Body:
 *   {
 *     value: [
 *       {
 *         clientState:        string,
 *         resourceData:       object,
 *         subscriptionId:     string,
 *         changeType:         string,
 *         resource:           string,  // e.g. "Users/{id}/Messages/{id}"
 *       }
 *     ]
 *   }
 *
 * Response:
 *   202 Accepted — always returned immediately to acknowledge receipt
 *   400          — if the request body is malformed
 *
 * Side Effects:
 *   - Updates lastDeltaLink on the oauth_accounts record
 *   - Inserts new lead records into the leads table
 *   - Creates conversation records and sends initial SMS or email outreach
 */
outlookEmailWebhook.post('/outlook', async (req, res) => {
  // Microsoft Graph requires a 202 response quickly to avoid retries.
  // We acknowledge immediately and process asynchronously.
  res.sendStatus(202);

  try {
    const notifications = req.body?.value;

    if (!Array.isArray(notifications) || notifications.length === 0) {
      return;
    }

    for (const notification of notifications) {
      try {
        // Verify the client state secret to ensure the notification is genuine
        if (notification.clientState !== process.env.MICROSOFT_WEBHOOK_CLIENT_STATE) {
          console.warn('Invalid clientState on Graph notification — ignoring.');
          continue;
        }

        // Extract the user ID from the resource path: "Users/{userId}/Messages/{messageId}"
        const resourceMatch = notification.resource?.match(/Users\/([^/]+)\//i);
        const providerUserId = resourceMatch?.[1] ?? null;

        if (!providerUserId) {
          console.warn('Could not extract user ID from Graph notification resource:', notification.resource);
          continue;
        }

        // Look up the oauth account by Microsoft provider user ID
        const [oauthAcc] = await db
          .select()
          .from(oauthAccounts)
          .innerJoin(users, eq(oauthAccounts.userId, users.id))
          .where(
            and(
              eq(oauthAccounts.providerUserId, providerUserId),
              eq(oauthAccounts.provider, 'microsoft'),
            )
          )
          .limit(1);

        if (!oauthAcc) {
          console.log('OAuth account not found for provider user ID:', providerUserId);
          continue;
        }

        const rawEmails = await readNewOutlookEmails(oauthAcc.oauth_accounts);

        if (rawEmails.length === 0) continue;

        const parsedLeads = await checkEmails(rawEmails);

        if (parsedLeads.length === 0) continue;

        const newLeads = await checkDuplicates(parsedLeads, oauthAcc.users);

        if (newLeads.length === 0) continue;

        const insertedLeads = await db
          .insert(leads)
          .values(
            newLeads.map(({ parsedLead, propertyId }) => ({
              propertyId: propertyId ?? null,
              userId: oauthAcc.users.id,
              name: parsedLead.name ?? null,
              email: parsedLead.email ?? null,
              phone: parsedLead.phone ?? null,
              source: parsedLead.source,
              sourceId: parsedLead.zillowId ?? parsedLead.realtorId ?? 'unknown',
            }))
          )
          .returning();

        await sendInitialMessages(
          insertedLeads,
          oauthAcc.users.email,
          oauthAcc.oauth_accounts.refreshToken,
        );

        console.log('Outlook leads accepted:', insertedLeads);
      } catch (err) {
        console.error('Error processing Graph notification:', err);
      }
    }
  } catch (err) {
    console.error('Outlook webhook handler error:', err);
  }
});

export default outlookEmailWebhook;

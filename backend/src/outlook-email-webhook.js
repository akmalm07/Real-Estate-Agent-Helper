import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, oauthAccounts, leads, leadNotes, userOnboarding } from '../db/schema.js';
import { msalClient } from './outlook.js';
import { checkForLeadAndReply } from './email-helpers.js';
import {
  checkEmails,
  checkDuplicates,
  sendInitialMessages,
} from './pubsub-webhook-helpers.js';

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

/* Builds the agentInfo object expected by the AI reply pipeline.
 * Loads the user's name/email/phone and onboarding brokerage in parallel.
 * Returns null if the user can't be found (defensive — shouldn't happen).
 */
async function buildAgentInfo(userId) {
  const [agent, onboarding] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(userOnboarding).where(eq(userOnboarding.userId, userId)).limit(1),
  ]);

  if (!agent || agent.length === 0) return null;

  return {
    name:      agent[0].name,
    email:     agent[0].email,
    phone:     agent[0].phone || null,
    brokerage: (onboarding && onboarding.length > 0) ? onboarding[0].brokerage : null,
  };
}

/* Normalizes a Microsoft Graph message object into the shared email format
 * expected by checkEmails() in pubsub-webhook-helpers.js.
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
 *   oauth: object — the oauth_accounts DB row (must have refreshToken, lastDeltaLink, id)
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
 * inserts new leads into the database, sends an initial outreach message,
 * and runs the reply-detection pipeline so AI can respond to known leads.
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
 *   - For referral leads, writes a "Referred by: ..." lead note for visibility
 *   - Creates conversation records and sends initial SMS or email outreach to
 *     verified leads only
 *   - Saves inbound lead reply emails and sends AI-generated threaded replies
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
        const oauthResults = await db
          .select()
          .from(oauthAccounts)
          .where(
            and(
              eq(oauthAccounts.providerUserId, providerUserId),
              eq(oauthAccounts.provider, 'microsoft'),
            )
          )
          .limit(1);

        const oauthAcc = oauthResults[0] ?? null;

        if (!oauthAcc) {
          console.log('OAuth account not found for provider user ID:', providerUserId);
          continue;
        }

        // Look up the user record separately to avoid innerJoin issues with the Neon HTTP driver
        const userResults = await db
          .select()
          .from(users)
          .where(eq(users.id, oauthAcc.userId))
          .limit(1);

        const user = userResults[0] ?? null;

        if (!user) {
          console.log('User not found for oauth account:', oauthAcc.id);
          continue;
        }

        const rawEmails = await readNewOutlookEmails(oauthAcc);

        if (rawEmails.length === 0) continue;

        // Run both pipelines concurrently, mirroring the Gmail webhook:
        //   1. New lead detection + initial outreach
        //   2. Lead reply detection + AI threaded response
        const [parsedLeads] = await Promise.all([
          checkEmails(rawEmails),
          checkForLeadAndReply(
            rawEmails,
            user.id,
            user.email,
            oauthAcc.refreshToken,
          ),
        ]);

        if (parsedLeads.length === 0) continue;

        const newLeads = await checkDuplicates(parsedLeads, user);

        if (newLeads.length === 0) continue;

        // Same sourceId semantics as the Gmail webhook:
        //   - platform leads (zillow/realtor/...): sourceId = listing/lead ID
        //   - referral leads:                       sourceId = referrer name
        //   - direct/unknown:                       sourceId = null
        const computeSourceId = (parsedLead) => {
          if (parsedLead.source === 'referral') {
            return parsedLead.referredBy ?? null;
          }
          return parsedLead.sourceId ?? null;
        };

        const insertedLeads = await db
          .insert(leads)
          .values(
            newLeads.map(({ parsedLead, propertyId }) => ({
              propertyId: propertyId ?? null,
              userId:     user.id,
              name:       parsedLead.name  ?? null,
              email:      parsedLead.email ?? null,
              phone:      parsedLead.phone ?? null,
              source:     parsedLead.source,
              status:     parsedLead.askClient ? 'unverified' : 'active',
              aiEnabled:  parsedLead.askClient ? false : true,
              sourceId:   computeSourceId(parsedLead),
            }))
          )
          .returning();

        const pairedLeads = insertedLeads.map((insertedLead, i) => ({
          insertedLead,
          parsedLead: newLeads[i].parsedLead,
        }));

        // Write a referral note for every referral lead (verified or not).
        for (const { insertedLead, parsedLead } of pairedLeads) {
          if (parsedLead.source === 'referral' && parsedLead.referredBy) {
            await db.insert(leadNotes).values({
              leadId: insertedLead.id,
              note:   `Referred by: ${parsedLead.referredBy}`,
            });
          }
        }

        // Only send initial outreach to verified (active) leads.
        const verifiedLeads = pairedLeads
          .filter(({ insertedLead }) => insertedLead.status === 'active')
          .map(({ insertedLead }) => insertedLead);

        if (verifiedLeads.length > 0) {
          const agentInfo = await buildAgentInfo(user.id);

          await sendInitialMessages(
            verifiedLeads,
            user.email,
            oauthAcc.refreshToken,
            null,   // message
            null,   // subject
            agentInfo,
          );
        }

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

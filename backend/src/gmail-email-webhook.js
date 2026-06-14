import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, oauthAccounts, leads } from '../db/schema.js';
import { checkForLeadAndReply } from './email-helpers.js';
import {
  checkEmails,
  checkDuplicates,
  sendInitialMessages,
} from './email-webhook-helpers.js';

const googleOAuthClient = new OAuth2Client();

const pubsubEmailWebhook =  Router();

const pubSubAudience = process.env.PUB_SUB_AUDIENCE;

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

async function verifyPubSubToken(token) {

  const ticket = await googleOAuthClient.verifyIdToken({
    idToken: token,
    audience: pubSubAudience,
  });

  return ticket.getPayload();
}

async function readNewEmails(oauth, newHistoryId) {
  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token: oauth.refreshToken,
  });

  const accessTokenResponse = await oauth2Client.getAccessToken();
  const accessToken = accessTokenResponse.token;

  const startHistoryId = oauth.lastHistoryId;

  if (!startHistoryId) {
    throw new Error('No stored historyId. Initialize it when creating the watch.');
  }

  const historyResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!historyResponse.ok) {
    throw new Error(await historyResponse.text());
  }

  const historyData = await historyResponse.json();

  const messageIds = new Set();

  for (const history of historyData.history ?? []) {
    for (const added of history.messagesAdded ?? []) {
      messageIds.add(added.message.id);
    }
  }

  const emails = [];

  for (const messageId of messageIds) {
    const messageResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!messageResponse.ok) {
      continue;
    }

    emails.push(await messageResponse.json());
  }

  // Save the new history id
  await db
    .update(oauthAccounts)
    .set({ lastHistoryId: newHistoryId })
    .where(eq(oauthAccounts.id, oauth.id));

  return emails;
}

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/

/* This route is called by Google Pub/Sub when a new Gmail message arrives
 * for a watched inbox. It verifies the Pub/Sub push token, reads new emails
 * via the Gmail History API, parses them for leads, deduplicates, inserts
 * new leads into the database, and sends an initial outreach message.
 * It also checks whether any incoming email is a reply from a known lead
 * and responds automatically via AI.
 *
 * Headers:
 *   Authorization: Bearer <Google-signed OIDC token>
 *
 * Request Body:
 *   {
 *     message: {
 *       data: string  // base64-encoded JSON: { emailAddress: string, historyId: string }
 *     }
 *   }
 *
 * Response:
 *   200 OK — always returned on success or graceful no-op
 *   401    — if the Pub/Sub token is invalid or the service account doesn't match
 *
 * Side Effects:
 *   - Updates lastHistoryId on the oauth_accounts record
 *   - Inserts new lead records into the leads table
 *   - Creates conversation records and sends initial SMS or email outreach
 *   - Saves inbound lead reply emails and sends AI-generated responses
 */
pubsubEmailWebhook.post('/gmail', async (req, res) => {
  
  // Authentication layer
  try {
    const auth = req.headers.authorization;

    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).send('Unauthorized');
    }

    const token = auth.substring(7);

    const payload = await verifyPubSubToken(token);

    if (payload.email !== process.env.GOOGLE_PUB_SUB_AUTH_SERVICE_ACCOUNT) {
      return res.sendStatus(401);
    }

    const pubSubMsgEncoded = req.body.message.data;

    const pubSubMsgDecoded = JSON.parse(
      Buffer.from(pubSubMsgEncoded, 'base64').toString('utf8')
    );

    const [oauthAcc] = await db
      .select()
      .from(oauthAccounts)
      .innerJoin(users, eq(oauthAccounts.userId, users.id))
      .where(eq(users.email, pubSubMsgDecoded.emailAddress))
      .limit(1);

    if (!oauthAcc) {
      console.log('OAuth account not found for email:', pubSubMsgDecoded.emailAddress);
      return res.sendStatus(200); // Ignore unrecognized email
    }

    const rawEmails = await readNewEmails(oauthAcc.oauth_accounts, pubSubMsgDecoded.historyId);
    if (rawEmails.length === 0) return res.sendStatus(200);

    // Run both pipelines concurrently:
    //   1. New lead detection + initial outreach
    //   2. Lead reply detection + AI response
    const [parsedLeads] = await Promise.all([
      checkEmails(rawEmails),
      checkForLeadAndReply(
        rawEmails,
        oauthAcc.users.id,
        oauthAcc.users.email,
        oauthAcc.oauth_accounts.refreshToken,
      ),
    ]);

    if (parsedLeads.length > 0) {
      const newLeads = await checkDuplicates(parsedLeads, oauthAcc.users);

      if (newLeads.length > 0) {
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

        console.log('Leads accepted:', insertedLeads);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(401);
  }
});

export default pubsubEmailWebhook;

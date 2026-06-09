import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { eq, and, lt } from 'drizzle-orm';
import { db } from '../db/index.js'
import { oauthAccounts } from '../db/schema.js'
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client();



const schaduledGmailWatchRouter = Router();


async function verifySchedulerToken(authHeader) {
  const token = authHeader?.replace('Bearer ', '');

  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: process.env.SCHEDULER_URL,
  });

  return ticket.getPayload();
}


async function refreshGmailWatch(req, res) {

  // Authorization layer

  const auth = req.headers.authorization;

  try {
    const payload = await verifySchedulerToken(auth);

    if (payload.email !== process.env.SCHEDULER_AUTH_SERVICE_ACCOUNT) {
      return res.status(401).send('Unauthorized');
    }
  } catch {
    return res.status(401).send('Unauthorized');
  }

  // Logic layer

  const oneDayMS = 24 * 60 * 60 * 1000;

  const accounts = await db
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, 'google'),
        lt(
          oauthAccounts.gmailWatchExpiration,
          new Date(Date.now() + oneDayMS)
        )
      )
    );

  let success = 0;
  let failed = 0;

  for (const account of accounts) {
    try {
      const oauth2Client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      oauth2Client.setCredentials({
        refresh_token: account.refreshToken,
      });

      const accessToken = await oauth2Client.getAccessToken();

      if (!accessToken.token) {
        throw new Error('Failed to obtain access token');
      }

      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/watch',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            topicName: process.env.GMAIL_TOPIC,
            labelIds: ['INBOX'],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Watch failed: ${await response.text()}`
        );
      }
      
      const sixDaysMS = 6 * 24 * 60 * 60 * 1000;

      await db.update(oauthAccounts).set({
        gmailWatchExpiration: new Date(Date.now() + sixDaysMS),
        }).where(eq(oauthAccounts.id, account.id));

      success++;
    } catch (err) {
      console.error(
        `Failed to refresh Gmail watch for account ${account.id}:`,
        err
      );

      failed++;
    }
  }

  return res.json({
    success,
    failed,
  });
}


schaduledGmailWatchRouter.get('/daily', async (req, res) => {
  
  return refreshGmailWatch(req, res);
  
});


export default schaduledGmailWatchRouter;
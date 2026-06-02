import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { eq, and, lt } from 'drizzle-orm';
import { db } from '../db/index.js'
import { oauthAccounts } from '../db/schema.js'

const internalMaintinenceRouter = Router();

internalMaintinenceRouter.get('/daily', async (req, res) => {
  
});

internalMaintinenceRouter.get('/gmail-watch-refresh', async (req, res) => {

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
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            topicName: process.env.GMAIL_TOPIC,
            labelIds: ['INBOX'],
          }),
        }
      );
      
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
});


export default internalMaintinenceRouter;
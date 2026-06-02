import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js'
import { users, oauthAccounts } from '../db/schema.js'
import { createToken, verifyToken } from './jwt.js'

const googleAuthRouter = Router();

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI;

const SCOPES = process.env.GOOGLE_SCOPES.split(',');


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/


function createGoogleUrl(promptConsent = false) {
  const oauth2Client = new OAuth2Client(
    clientId,
    clientSecret,
    redirectUri
  );

  let authUrl;

  if (!promptConsent) {
    authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
  } else {
    authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });
  }
  
  return authUrl;
}

async function setupGmailWatch({ oauth2Client, oauthDbId }) {
  const accessToken = await oauth2Client.getAccessToken();

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
    throw new Error(await response.text());
  }

  const json = await response.json();

  console.log(json.historyId);

  const sixDaysMS = 6 * 24 * 60 * 60 * 1000;

  await db.update(oauthAccounts).set({
    gmailWatchExpiration: new Date(Date.now() + sixDaysMS),
    }).where(eq(oauthAccounts.id, oauthDbId));
}

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/

googleAuthRouter.get('/login', (req, res) => {
  const token = req.cookies.token;

  if (token) {
   try {
      verifyToken(token);
      return res.redirect('/dashboard');
    } catch {}
  }
  
  const authUrl = createGoogleUrl();

  res.redirect(authUrl);
});



googleAuthRouter.get('/auth', async (req, res) => {

  const code = req.query.code;

  if (!code) {
    return res.status(400).send('Missing authorization code.');
  }

  try {
    let userFirstTime = false;

    const oauth2Client = new OAuth2Client(
      clientId,
      clientSecret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const refreshToken = tokens.refresh_token;

    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      }
    );

    if (!response.ok) {
      console.error(await response.text());
      return res.status(400).send('Failed to get user info');
    }

    const userInfo = await response.json();

    if (!userInfo?.id || !userInfo?.email || !userInfo?.name) {
      return res.status(400).json({
        error: 'Failed to fetch Google user info',
      });
    }

    let userId;

    const [existingAccount] = await db
      .select({
        accountId: oauthAccounts.id,
        userId: users.id,
        email: users.email,
      })
      .from(oauthAccounts)
      .innerJoin(users, eq(oauthAccounts.userId, users.id))
      .where(
        and(
          eq(oauthAccounts.providerUserId, userInfo.id),
          eq(oauthAccounts.provider, 'google')
        )
      )
      .limit(1);
    
    let oauthDbId;
    
    if (existingAccount) {
      
      oauthDbId = existingAccount.accountId;

      if (userInfo.email !== existingAccount.email) {
        return res.status(400).json({
          error: 'Failed to verify email',
        });
      }

      userId = existingAccount.userId;

      // Google may occasionally issue a new refresh token.
      if (refreshToken) {
        await db
          .update(oauthAccounts)
          .set({
            refreshToken: refreshToken,
          })
          .where(eq(oauthAccounts.id, existingAccount.accountId))
      }
    } else {

      if (!refreshToken)
      {
        const authUrl = createGoogleUrl(true);
        return res.redirect(authUrl);
      }

      let userDb;
      try {
        userDb = await db
          .insert(users)
          .values({
            name: userInfo.name,
            email: userInfo.email,
          })
          .returning({
            id: users.id,
          });
      } catch {
        return res.status(409).send('User already exists. Try authenticating with Microsoft');
      }
      const user = userDb[0];

      const [oauthAccount] = await db.insert(oauthAccounts).values({
        userId: user.id,
        provider: 'google',
        providerUserId: userInfo.id,
        refreshToken: refreshToken,
      }).returning({
        id: oauthAccounts.id,
      });

      oauthDbId = oauthAccount.id;

      userId = user.id;
      userFirstTime = true;
    }

    const token = createToken(userId);

    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // TODO: change to true in production with HTTPS
      sameSite: 'lax',
    });
    
    try {
      setupGmailWatch({
        oauth2Client: oauth2Client,
        oauthDbId: oauthDbId,
      });
    } catch {
      return res.status(500).send('Error setting up watch for Pub/Sub');
    }

    return res.redirect(`/onboard?firstTime=${userFirstTime}`);

  } catch (err) {
    console.error('OAuth callback error:', err);

    return res.status(500).json({
      error: 'Authentication failed',
    });
  }
});


googleAuthRouter.get('/status', (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.json({
      authenticated: false,
    });
  }

  try {
    verifyToken(token);

    return res.json({
      authenticated: true,
    });
  } catch {
    return res.json({
      authenticated: false,
    });
  }
});



googleAuthRouter.get('/logout', (req, res) => {
  try {
    res.clearCookie('token');
    res.send('Logged out successfully.');
  } catch (err) {
    res.status(500).send('Logout failed.');
  }
});

export default googleAuthRouter;
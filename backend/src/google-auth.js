import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js'
import { users, oauthAccounts } from '../db/schema.js'
import { createToken, verifyToken, createTempToken, verifyTempToken } from './jwt.js'
import { cookieJson } from './consts.js';

const googleAuthRouter = Router();

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI;

const SCOPES = (process.env.GOOGLE_SCOPES || '').split(',').filter(Boolean);

// The frontend origin — used for post-OAuth redirects back into the SPA.
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function createGoogleUrl(oauthClient, promptConsent = false) {
  let oauth2Client;
  if (oauthClient) {
    oauth2Client = oauthClient;
  } else {
    oauth2Client = new OAuth2Client(
      clientId,
      clientSecret,
      redirectUri
    );
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    ...(promptConsent && { prompt: 'consent' }),
  });

  return authUrl;
}

/* Returns a Google OAuth URL that forces the consent screen, causing Google
 * to issue a fresh refresh token. Use this when a stored refresh token has
 * expired or been revoked and the user must re-authorize.
 *
 * Returns:
 *   string — the full Google OAuth consent URL
 */
export function buildReconsentUrl() {
  return createGoogleUrl(null, true);
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

  const sixDaysMS = 6 * 24 * 60 * 60 * 1000;

  await db.update(oauthAccounts).set({
    gmailWatchExpiration: new Date(Date.now() + sixDaysMS),
    lastHistoryId: json.historyId,
  }).where(eq(oauthAccounts.id, oauthDbId));
}

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/

/* Called by the frontend to initiate Google OAuth signup.
 * Redirects the browser to the Google consent screen.
 *
 * Query: None
 * Headers: None
 * Request Body: None
 *
 * Response:
 *   302 redirect to Google OAuth consent URL
 */
googleAuthRouter.get('/signup', (req, res) => {
  const authUrl = createGoogleUrl(null, true);
  return res.redirect(authUrl);
});

/* Called by the frontend to initiate Google OAuth login.
 * If the user already has a valid session cookie, returns authenticated: true
 * so the frontend can skip the OAuth flow entirely.
 *
 * Query: None
 * Headers: None
 * Request Body: None
 *
 * Response:
 *   { authenticated: true } — if a valid session cookie exists
 *   302 redirect to Google OAuth consent URL — otherwise
 */
googleAuthRouter.get('/login', (req, res) => {
  const token = req.cookies.token;
  if (token) {
    try {
      verifyToken(token);
      return res.json({ authenticated: true });
    } catch {}
  }

  const authUrl = createGoogleUrl(null, true);
  return res.redirect(authUrl);
});

/* Called by the frontend (GoogleCallbackPage) after the backend redirects
 * back with a tempToken query parameter. Exchanges the short-lived temp
 * token for a full session cookie.
 *
 * This exists because httpOnly cookies cannot survive a cross-origin 302
 * redirect — so the backend passes a signed temp token in the URL instead,
 * and the frontend POSTs it here to receive the real session cookie.
 *
 * Headers:
 *   Content-Type: application/json
 *
 * Request Body:
 *   {
 *     tempToken: string
 *   }
 *
 * Response:
 *   { success: true }
 *
 * Side Effects:
 *   - Sets an httpOnly session cookie named 'token'
 */
googleAuthRouter.post('/exchange', async (req, res) => {
  const { tempToken } = req.body;

  try {
    const payload = verifyTempToken(tempToken);
    const token = createToken(payload.id);

    res.cookie('token', token, cookieJson);

    return res.json({ success: true });
  } catch (err) {
    console.error('Temp token exchange failed:', err);
    return res.status(401).json({ error: 'Invalid or expired temp token.' });
  }
});

/* Called by Google after the user accepts the OAuth consent screen.
 * Exchanges the authorization code for tokens, upserts the user and
 * OAuth account in the database, sets up Gmail push notifications,
 * then redirects the browser back to the frontend with a short-lived
 * tempToken in the query string.
 *
 * Query:
 *   code: string — the authorization code from Google
 *
 * Headers: None
 * Request Body: None
 *
 * Response:
 *   302 redirect to ${FRONTEND_URL}/google/callback?firstTime=...&tempToken=...
 *
 * Side Effects:
 *   - Inserts or updates a user row
 *   - Inserts or updates an oauthAccounts row
 *   - Stores the refresh token in the database
 *   - Registers a Gmail push-notification watch
 *   - Creates a signed temp token (valid 5 minutes)
 */
googleAuthRouter.get('/', async (req, res) => {
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
      // Returning user — update the refresh token if Google issued a new one,
      // but never touch onboardComplete or any other user fields. We must not
      // overwrite progress the user has already made.
      oauthDbId = existingAccount.accountId;

      if (userInfo.email !== existingAccount.email) {
        return res.status(400).json({
          error: 'Failed to verify email',
        });
      }

      userId = existingAccount.userId;

      if (refreshToken) {
        await db
          .update(oauthAccounts)
          .set({ refreshToken })
          .where(eq(oauthAccounts.id, existingAccount.accountId));
      }
    } else {
      if (!refreshToken) {
        // No refresh token — redirect back to Google to force consent and get one.
        const authUrl = createGoogleUrl(oauth2Client, true);
        return res.redirect(authUrl);
      }

      // Brand-new user — insert with onboardComplete: false.
      // If a manual-signup user already exists with this email, link their
      // account by inserting the oauthAccounts row without touching the
      // existing user row (preserving any onboardComplete state they may
      // have already set).
      let userDb;
      try {
        const [tempUserDb] = await db
          .insert(users)
          .values({
            name: userInfo.name,
            email: userInfo.email,
            emailConfirmed: true,
            onboardComplete: false,
            source: 'google',
          })
          .onConflictDoNothing({
            target: users.email,
          })
          .returning();

        if (!tempUserDb) {
          // User already exists (manual signup) — fetch them without
          // overwriting onboardComplete or any other fields.
          const [existingUser] = await db
            .select()
            .from(users)
            .where(eq(users.email, userInfo.email))
            .limit(1);

          userDb = existingUser;
        } else {
          userDb = tempUserDb;
        }

      } catch (err) {
        console.warn(err);
        return res.status(409).send('User already exists. Try authenticating differently');
      }

      const user = userDb;

      const [oauthAccount] = await db.insert(oauthAccounts).values({
        userId: user.id,
        provider: 'google',
        providerUserId: userInfo.id,
        refreshToken,
      }).returning({ id: oauthAccounts.id });

      oauthDbId = oauthAccount.id;
      userId = user.id;

      // Only send to onboarding if they have never completed it.
      if (!user.onboardComplete) userFirstTime = true;
    }

    try {
      await setupGmailWatch({
        oauth2Client,
        oauthDbId,
      });
    } catch (err) {
      console.error('Error setting up Gmail watch:', err);
      // Non-fatal — continue with redirect
    }

    const tempToken = createTempToken(userId);

    return res.redirect(
      `${FRONTEND_URL}/google/callback?firstTime=${userFirstTime}&tempToken=${tempToken}`
    );

  } catch (err) {
    console.error('OAuth callback error:', err);
    return res.status(500).json({ error: 'Authentication failed' });
  }
});

/* Called by the frontend to check whether the current session cookie is valid.
 *
 * Query: None
 * Headers: None
 * Request Body: None
 *
 * Response:
 *   { authenticated: true }  — valid session cookie present
 *   { authenticated: false } — no cookie or invalid/expired token
 */
googleAuthRouter.get('/status', (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.json({ authenticated: false });
  }

  try {
    verifyToken(token);
    return res.json({ authenticated: true });
  } catch {
    return res.json({ authenticated: false });
  }
});

/* Called by the frontend to log the user out.
 * Clears the session cookie.
 *
 * Query: None
 * Headers: None
 * Request Body: None
 *
 * Response:
 *   200 'Logged out successfully.'
 */
googleAuthRouter.get('/logout', (req, res) => {
  try {
    res.clearCookie('token', cookieJson);
    res.send('Logged out successfully.');
  } catch (err) {
    res.status(500).send('Logout failed.');
  }
});

export default googleAuthRouter;

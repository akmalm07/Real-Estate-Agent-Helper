import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, oauthAccounts } from '../db/schema.js';
import { createToken, verifyToken } from './jwt.js';

const microsoftAuthRouter = Router();

const clientId = process.env.MICROSOFT_CLIENT_ID;
const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

// Microsoft expects space‑separated scopes in the authorization URL.
const rawScopes = process.env.MICROSOFT_SCOPES.split(',');

const SCOPES = rawScopes.join(' ');

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/

microsoftAuthRouter.get('/login', (req, res) => {
  const token = req.cookies.token;

  if (token) {
    try {
      verifyToken(token);
      return res.redirect('/dashboard');
    } catch {}
  }

  const authUrl =
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
    new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SCOPES,
    }).toString();

  res.redirect(authUrl);
});

microsoftAuthRouter.get('/auth', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('Missing authorization code.');
  }

  try {
    let userFirstTime = false;

    // Exchange the authorization code for tokens.
    const tokenResponse = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      }
    );

    if (!tokenResponse.ok) {
      console.error(await tokenResponse.text());
      return res.status(400).send('Failed to exchange code for token');
    }

    const tokens = await tokenResponse.json();
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token; // may be undefined if scope offline_access not present

    // Fetch the user's Microsoft profile.
    const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userRes.ok) {
      console.error(await userRes.text());
      return res.status(400).send('Failed to get user info');
    }

    const userInfo = await userRes.json();

    const providerUserId = userInfo.id;
    const userEmail = userInfo.userPrincipalName || userInfo.mail;

    if (!providerUserId || !userEmail || !userInfo.displayName) {
      return res.status(400).json({
        error: 'Failed to fetch Microsoft user info',
      });
    }

    let userId;

    // Check if the user already signed in with this Microsoft account.
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
          eq(oauthAccounts.providerUserId, providerUserId),
          eq(oauthAccounts.provider, 'microsoft')
        )
      )
      .limit(1);

    if (existingAccount) {
      // Verify that the email stored matches the Microsoft account email.
      if (userEmail !== existingAccount.email) {
        return res.status(400).json({
          error: 'Failed to verify email',
        });
      }

      userId = existingAccount.userId;

      // Microsoft may occasionally issue a new refresh token.
      if (refreshToken) {
        await db
          .update(oauthAccounts)
          .set({
            refreshToken,
          })
          .where(eq(oauthAccounts.id, existingAccount.accountId));
      }
    } else {
      // First‑time sign‑in — create the local user and link the Microsoft account.
      const [user] = await db
        .insert(users)
        .values({
          name: userInfo.displayName,
          email: userEmail,
        })
        .returning({
          id: users.id,
        });

      await db.insert(oauthAccounts).values({
        userId: user.id,
        provider: 'microsoft',
        providerUserId,
        refreshToken: refreshToken ?? null,
      });

      userId = user.id;
      userFirstTime = true;
    }

    const token = createToken(userId);

    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // change to true in production with HTTPS
      sameSite: 'lax',
    });

    return res.json({
      message: 'User authenticated',
      firstTime: userFirstTime,
    });
  } catch (err) {
    console.error('Microsoft OAuth callback error:', err);
    return res.status(500).json({
      error: 'Authentication failed',
    });
  }
});

microsoftAuthRouter.get('/status', (req, res) => {
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

microsoftAuthRouter.get('/logout', (req, res) => {
  try {
    res.clearCookie('token');
    res.send('Logged out successfully.');
  } catch (err) {
    res.status(500).send('Logout failed.');
  }
});

export default microsoftAuthRouter;

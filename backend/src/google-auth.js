import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const authRouter = Router();

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI;

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const TOKEN_PATH = path.join(__dirname, "..", "token.json");

// ───────────────────────── helpers ─────────────────────────

function saveRefreshToken(refreshToken) {
  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ refresh_token: refreshToken }), "utf8");
    console.log("Stored Gmail refresh token.");
  } catch (err) {
    console.error("Unable to save token:", err);
  }
}

function loadRefreshToken() {
  try {
    const raw = fs.readFileSync(TOKEN_PATH, "utf8");
    const data = JSON.parse(raw);
    return data.refresh_token || null;
  } catch (err) {
    return null;
  }
}

/**
 * Returns a fully‑configured OAuth2 client using the stored refresh token.
 * Throws if no token has been stored yet (user must authenticate first).
 */
export function getAuthClient() {
  const refreshToken = loadRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token stored. Please visit /auth/login first.");
  }
  const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

// ───────────────────────── routes ─────────────────────────

/**
 * Starts the OAuth flow by redirecting to Google’s consent screen.
 * The user must authenticate and grant read‑only Gmail access.
 */
authRouter.get('/login', (req, res) => {
  const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',   // required to obtain a refresh token
    scope: SCOPES,
    prompt: 'consent',       // always show consent screen (ensures refresh token)
  });
  console.log("Redirecting to Google OAuth...");
  res.redirect(authUrl);
});

/**
 * The route Google redirects the user to after they consent.
 * Exchanges the temporary authorisation code for access / refresh tokens
 * and stores the refresh token for later read‑only Gmail access.
 */
authRouter.get('/auth', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("Missing authorization code.");
  }

  try {
    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const refreshToken = tokens.refresh_token;
    if (refreshToken) {
      saveRefreshToken(refreshToken);
    } else {
      // Very unlikely because we requested offline access + forced consent.
      // If it happens we store the whole token set so access_token can be
      // used for a short while – the user should re‑login later.
      console.warn("No refresh token returned by Google.");
      fs.writeFileSync(TOKEN_PATH, JSON.stringify({ tokens }), "utf8");
    }

    res.send(`
      <html>
        <body>
          <h1>Authentication successful!</h1>
          <p>Read‑only Gmail access has been granted. You may close this page.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("Authentication failed. Please try again.");
  }
});

/**
 * Simple health‑check that reports whether a stored token exists.
 */
authRouter.get('/status', (req, res) => {
  const tokenExists = loadRefreshToken() !== null;
  res.json({ authenticated: tokenExists });
});

/**
 * Clears the stored token – effectively logging the user out.
 */
authRouter.get('/logout', (req, res) => {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
    res.send("Logged out successfully.");
  } catch (err) {
    res.status(500).send("Logout failed.");
  }
});

export default authRouter;

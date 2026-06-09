import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';



async function gmailRequest(gmailAuthClient, path, options = {}) {

  const { token } = await gmailAuthClient.getAccessToken();

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
      ...options,
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}



export async function createGmailAuthClient(refreshToken) {
  const auth = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  auth.setCredentials({
    refresh_token: refreshToken,
  });

  return auth;
}


export async function listMessages(gmailAuthClient, maxResults = 10) {
  const data = await gmailRequest(
    gmailAuthClient,
    `users/me/messages?maxResults=${maxResults}`
  );

  return data.messages || [];
}

export async function getMessage(gmailAuthClient, messageId) {
  return gmailRequest(
    gmailAuthClient,
    `users/me/messages/${messageId}`
  );
}

/* Sends an email on behalf of the authenticated user.
 *
 * Parameters:
 *   gmailAuthClient: OAuth2Client — authenticated Gmail client
 *   to:             string        — recipient email address
 *   subject:        string        — email subject line
 *   body:           string        — plain text email body
 *
 * Returns:
 *   The Gmail API send response object containing the sent message id.
 *
 * Side Effects:
 *   - Sends an email from the authenticated user's Gmail account.
 */
export async function sendEmail(gmailAuthClient, to, subject, body) {
  // Build a minimal RFC 2822 message
  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ];

  const rawMessage = messageParts.join('\n');

  // Gmail API requires base64url encoding
  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return gmailRequest(
    gmailAuthClient,
    'users/me/messages/send',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage }),
    }
  );
}

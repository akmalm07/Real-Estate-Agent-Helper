import { OAuth2Client } from 'google-auth-library';

/* Returns true if the error is caused by an expired or revoked Google
 * refresh token (i.e. the user needs to re-authorize).
 *
 * Parameters:
 *   err: unknown — any thrown value
 *
 * Returns:
 *   boolean
 */
export function isExpiredTokenError(err) {
  if (!err) return false;
  const message = err.message?.toLowerCase() ?? '';
  return (
    message.includes('invalid_grant') ||
    message.includes('token has been expired or revoked') ||
    message.includes('token expired') ||
    message.includes('invalid credentials')
  );
}

async function gmailRequest(gmailAuthClient, path, options = {}) {
  const { token } = await gmailAuthClient.getAccessToken();

  // Destructure caller headers out first so our Authorization always wins.
  const { headers: callerHeaders, ...restOptions } = options;

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/${path}`,
    {
      ...restOptions,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(callerHeaders || {}),
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
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

/* Sends a new email (not a reply) on behalf of the authenticated user.
 *
 * Parameters:
 *   gmailAuthClient: OAuth2Client — authenticated Gmail client
 *   to:             string        — recipient email address
 *   subject:        string        — email subject line
 *   body:           string        — plain text email body
 *
 * Returns:
 *   The Gmail API send response object: { id, threadId, labelIds }
 */
export async function sendEmail(gmailAuthClient, to, subject, body) {
  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ];

  const rawMessage = messageParts.join('\r\n');

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

/* Sends a reply email that is threaded correctly in Gmail.
 *
 * Sets the In-Reply-To and References headers so Gmail (and other clients)
 * group the reply into the same thread as the original message.
 * Also passes threadId in the request body so the Gmail API places the
 * message into the correct thread server-side.
 *
 * Parameters:
 *   gmailAuthClient:     OAuth2Client — authenticated Gmail client
 *   to:                  string       — recipient email address
 *   subject:             string       — subject line (sendReply will prefix "Re: " if missing)
 *   body:                string       — plain text email body
 *   inReplyToMessageId:  string       — the RFC 2822 Message-ID of the message being replied to
 *                                       (e.g. "<abc123@mail.gmail.com>")
 *   threadId:            string       — the Gmail thread ID to place this reply into
 *
 * Returns:
 *   The Gmail API send response object: { id, threadId, labelIds }
 */
export async function sendReply(gmailAuthClient, to, subject, body, inReplyToMessageId, threadId) {
  // Ensure the subject has the "Re: " prefix so mail clients thread it correctly.
  const replySubject = subject.startsWith('Re: ') ? subject : `Re: ${subject}`;

  // Both In-Reply-To and References must be set for proper threading per RFC 2822.
  const messageParts = [
    `To: ${to}`,
    `Subject: ${replySubject}`,
    `In-Reply-To: ${inReplyToMessageId}`,
    `References: ${inReplyToMessageId}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ];

  const rawMessage = messageParts.join('\r\n');

  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // Passing threadId in the request body tells the Gmail API to place this
  // message into the existing thread rather than starting a new one.
  return gmailRequest(
    gmailAuthClient,
    'users/me/messages/send',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage, threadId }),
    }
  );
}

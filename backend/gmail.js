import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

/**
 * Returns an authenticated Gmail API client.
 * The client will automatically refresh the access token when needed.
 */
export async function getGmailClient() {
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Lists the most recent messages in the authenticated user's mailbox.
 * @param {number} maxResults - Maximum number of messages to return (default 10).
 * @returns {Promise<Array>} Array of message objects (each contains id and threadId).
 */
export async function listMessages(maxResults = 10) {
  const gmail = await getGmailClient();
  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
  });
  return res.data.messages || [];
}

/**
 * Retrieves the full content of a specific message.
 * @param {string} messageId - The ID of the message to fetch.
 * @returns {Promise<Object>} The full message resource.
 */
export async function getMessage(messageId) {
  const gmail = await getGmailClient();
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
  });
  return res.data;
}

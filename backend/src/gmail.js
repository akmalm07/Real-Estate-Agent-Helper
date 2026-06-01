import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js'



async function gmailRequest(gmailAuthClient, path) {

  const { token } = await gmailAuthClient.getAccessToken();

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
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
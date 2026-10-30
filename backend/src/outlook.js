import { ConfidentialClientApplication } from '@azure/msal-node';
import { lazyClient } from './testing/local-boundary.js';


export const msalClient = lazyClient(() => new ConfidentialClientApplication({
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    authority: 'https://login.microsoftonline.com/common',
  },
}));

export async function createOutlookAuthClient(refreshToken) {
  // MSAL does NOT expose a simple 'set refresh token' API like Google.
  // Instead we store the refresh token and exchange it for access tokens.

  const tokenResponse = await msalClient.acquireTokenByRefreshToken({
    refreshToken,
    scopes: ['Mail.Read'],
  });

  return {
    accessToken: tokenResponse.accessToken,
  };
}



async function outlookRequest(accessToken, path) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/${path}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}


export async function listMessages(accessToken, top = 10) {
  const data = await outlookRequest(
    accessToken,
    `me/messages?$top=${top}`
  );

  return data.value || [];
}



export async function getMessage(accessToken, messageId) {
  return outlookRequest(
    accessToken,
    `me/messages/${messageId}`
  );
}

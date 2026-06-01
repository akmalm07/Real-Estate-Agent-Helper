import test from 'node:test';
import assert from 'node:assert/strict';
import { eq, and } from 'drizzle-orm';

import { db } from '../db/index.js';
import { users, oauthAccounts } from '../db/schema.js';

import {
  listMessages,
  getMessage,
  createOutlookAuthClient
} from '../src/outlook.js';


/*
|--------------------------------------------------------------------------
| Helper: get test OAuth account
|--------------------------------------------------------------------------
*/
async function getTestOauth() {
  const userResult = await db
    .select()
    .from(users)
    .where(eq(users.email, "akmalmukhamadiev2020@gmail.com"))
    .limit(1);

  const user = userResult[0];

  if (!user) {
    throw new Error("User not found");
  }

  const oauthResult = await db
    .select()
    .from(oauthAccounts)
    .where(and(
      eq(oauthAccounts.userId, user.id),
      eq(oauthAccounts.provider, 'microsoft'))
    )
    .limit(1);

  const oauth = oauthResult[0];

  if (!oauth) {
    throw new Error("OAuth account not found");
  }

  return oauth;
}


test('creates outlook auth client', async () => {
  const oauth = await getTestOauth();

  const client = await createOutlookAuthClient(oauth.refreshToken);

  assert.ok(client);
  assert.ok(client.accessToken);
});


test('lists outlook messages', async () => {
  const oauth = await getTestOauth();

  const client = await createOutlookAuthClient(oauth.refreshToken);

  const messages = await listMessages(client.accessToken, 5);

  assert.ok(Array.isArray(messages));
});


test('gets first outlook message', async () => {
  const oauth = await getTestOauth();

  const client = await createOutlookAuthClient(oauth.refreshToken);

  const messages = await listMessages(client.accessToken, 1);

  assert.ok(messages.length > 0);

  const message = await getMessage(
    client.accessToken,
    messages[0].id
  );

  assert.equal(message.id, messages[0].id);
});
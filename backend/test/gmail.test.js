import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js'
import { users, OAuth2Client } from '../db/index.js'

import { OAuth2Client } from 'google-auth-library';

import {
  listMessages,
  getMessage,
  createGmailAuthClient
} from '../src/gmail.js';


function getTestOauth()
{
  const userResult = await db
    .select()
    .from(users)
    .where(eq(users.email, "akmalmukhamadiev2020@gmail.com"))
    .limit(1);

  const user = userResult[0];

  if (!user) {
    throw new Error("User not found");
  }

  // 2. get oauth account
  const oauthResult = await db
    .select()
    .from(oauthAccounts)
    .where(and(
      eq(oauthAccounts.userId, user.id),
      eq(oauthAccounts.provider, 'google'))
    )
    .limit(1);

  return oauthResult[0];
}


/*
|--------------------------------------------------------------------------
| 1. AUTH CLIENT TEST
|--------------------------------------------------------------------------
*/
test('creates gmail auth client', async () => {
  oauth = getTestOauth();

  const client = await createGmailAuthClient(oauth.refreshToken);

  assert.ok(client);
});

/*
|--------------------------------------------------------------------------
| 2. LIST MESSAGES TEST
|--------------------------------------------------------------------------
*/
test('lists gmail messages', async () => {
  oauth = getTestOauth();

  const client = await createGmailAuthClient(oauth.refreshToken);

  const messages = await listMessages(client, 5);

  assert.ok(Array.isArray(messages));
});

/*
|--------------------------------------------------------------------------
| 3. GET MESSAGE TEST
|--------------------------------------------------------------------------
*/
test('gets first gmail message', async () => {
  oauth = getTestOauth();

  const client = await createGmailAuthClient(oauth.refreshToken);

  const messages = await listMessages(client, 1);

  assert.ok(messages.length > 0);

  const message = await getMessage(
    client,
    messages[0].id
  );

  assert.equal(message.id, messages[0].id);
});
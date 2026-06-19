import 'dotenv/config';

import test from 'node:test';
import assert from 'node:assert/strict';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, oauthAccounts, leads, conversations, email as emailTable } from '../db/schema.js';

import {
  listMessages,
  getMessage,
  createGmailAuthClient,
  sendEmail,
  sendReply,
} from '../src/gmail.js';

async function getTestOauth() {
  const userResult = await db
    .select()
    .from(users)
    .where(eq(users.email, 'akmalmukhamadiev2020@gmail.com'))
    .limit(1);

  const user = userResult[0];

  if (!user) {
    throw new Error('User not found');
  }

  const oauthResult = await db
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.userId, user.id),
        eq(oauthAccounts.provider, 'google')
      )
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
  const oauth = await getTestOauth();
  const client = await createGmailAuthClient(oauth.refreshToken);
  assert.ok(client);
});

/*
|--------------------------------------------------------------------------
| 2. LIST MESSAGES TEST
|--------------------------------------------------------------------------
*/
test('lists gmail messages', async () => {
  const oauth = await getTestOauth();
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
  const oauth = await getTestOauth();
  const client = await createGmailAuthClient(oauth.refreshToken);
  const messages = await listMessages(client, 1);
  assert.ok(messages.length > 0);
  const message = await getMessage(client, messages[0].id);
  assert.equal(message.id, messages[0].id);
});

/*
|--------------------------------------------------------------------------
| 4. SEND, REPLY (with In-Reply-To), AND VERIFY SAME THREAD TEST
|--------------------------------------------------------------------------
*/

// Polls Gmail for a message whose Subject header matches the given subject,
// retrying up to maxAttempts times with a delay between each attempt.
async function pollForMessage(client, subject, maxAttempts = 10, delayMs = 3000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const messages = await listMessages(client, 20);

    for (const { id } of messages) {
      const msg = await getMessage(client, id);
      const headers = msg.payload?.headers ?? [];
      const subjectHeader = headers.find((h) => h.name.toLowerCase() === 'subject')?.value ?? '';

      if (subjectHeader === subject) {
        return msg;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`Timed out waiting for message with subject: "${subject}"`);
}

// Extracts the RFC 2822 Message-ID header value from a Gmail message object.
// Returns null if not found.
function extractMessageId(gmailMessage) {
  const headers = gmailMessage.payload?.headers ?? [];
  return headers.find((h) => h.name.toLowerCase() === 'message-id')?.value ?? null;
}

test('send email, reply with In-Reply-To header, and verify both land in the same DB conversation', async () => {
  const oauth = await getTestOauth();
  const client = await createGmailAuthClient(oauth.refreshToken);

  const agentEmail = 'akmalmukhamadiev2020@gmail.com';
  const uniqueSubject = `Test thread ${Date.now()}`;

  // ── Step 1: Send the initial email ──────────────────────────────────────
  const sentInitial = await sendEmail(client, agentEmail, uniqueSubject, 'This is the initial test email.');

  // The Gmail API returns { id, threadId } — capture the threadId immediately
  // so we can use it for the reply without polling.
  const initialGmailId = sentInitial.id;
  const initialThreadId = sentInitial.threadId;

  assert.ok(initialGmailId, 'Sent initial email should have a Gmail message ID');
  assert.ok(initialThreadId, 'Sent initial email should have a Gmail thread ID');

  // ── Step 2: Poll Gmail until the sent email appears so we can read its
  //            RFC 2822 Message-ID header (needed for In-Reply-To).
  const initialMsg = await pollForMessage(client, uniqueSubject);
  assert.ok(initialMsg, 'Initial email should appear in inbox');

  const rfcMessageId = extractMessageId(initialMsg);
  assert.ok(rfcMessageId, 'Initial email must have a Message-ID header for threading');

  // ── Step 3: Insert a test lead + conversation into the DB ────────────────
  const userResult = await db
    .select()
    .from(users)
    .where(eq(users.email, agentEmail))
    .limit(1);
  const user = userResult[0];
  assert.ok(user, 'Test user must exist in the DB');

  const [testLead] = await db
    .insert(leads)
    .values({
      userId: user.id,
      source: 'unknown',
      sourceId: null,
      email: agentEmail,
    })
    .returning();

  const [testConversation] = await db
    .insert(conversations)
    .values({
      leadId: testLead.id,
      type: 'email',
      externalThreadId: initialThreadId,
      initialSender: { email: agentEmail },
      initialRecipient: [{ email: agentEmail }],
      status: 'active',
    })
    .returning();

  // ── Step 4: Save the initial email to the DB ─────────────────────────────
  // Store the RFC 2822 Message-ID as externalMessageId so future In-Reply-To
  // lookups in findExistingEmailConversation() can match it.
  const [savedInitialEmail] = await db
    .insert(emailTable)
    .values({
      conversationId: testConversation.id,
      externalMessageId: rfcMessageId,
      direction: 'outbound',
      sender: { email: agentEmail },
      recipient: [{ email: agentEmail }],
      cc: [],
      subject: uniqueSubject,
      body: 'This is the initial test email.',
      sentAt: new Date(),
    })
    .returning();

  assert.ok(savedInitialEmail.id, 'Initial email should be saved to DB');

  // ── Step 5: Send a proper threaded reply using sendReply() ───────────────
  // sendReply() sets In-Reply-To and References to rfcMessageId and passes
  // threadId so Gmail places the reply in the same thread server-side.
  const sentReply = await sendReply(
    client,
    agentEmail,
    uniqueSubject,       // sendReply will prefix "Re: " automatically
    'This is the reply email.',
    rfcMessageId,        // In-Reply-To: the RFC 2822 Message-ID of the initial email
    initialThreadId,     // threadId: tells Gmail API to place reply in same thread
  );

  const replyGmailId = sentReply.id;
  const replyThreadId = sentReply.threadId;

  assert.ok(replyGmailId, 'Reply should have a Gmail message ID');

  // Both messages must be in the same Gmail thread
  assert.equal(
    replyThreadId,
    initialThreadId,
    'Reply must be in the same Gmail thread as the initial email'
  );

  // ── Step 6: Poll Gmail until the reply appears ───────────────────────────
  const replySubject = `Re: ${uniqueSubject}`;
  const replyMsg = await pollForMessage(client, replySubject);
  assert.ok(replyMsg, 'Reply email should appear in inbox');

  // Verify the reply's In-Reply-To header matches the initial email's Message-ID
  const replyHeaders = replyMsg.payload?.headers ?? [];
  const replyInReplyTo = replyHeaders.find((h) => h.name.toLowerCase() === 'in-reply-to')?.value ?? null;
  assert.equal(
    replyInReplyTo,
    rfcMessageId,
    'Reply In-Reply-To header must match the initial email Message-ID'
  );

  // ── Step 7: Save the reply to the same conversation in the DB ───────────
  const replyRfcMessageId = extractMessageId(replyMsg);

  const [savedReplyEmail] = await db
    .insert(emailTable)
    .values({
      conversationId: testConversation.id,
      externalMessageId: replyRfcMessageId ?? replyGmailId,
      direction: 'inbound',
      sender: { email: agentEmail },
      recipient: [{ email: agentEmail }],
      cc: [],
      subject: replySubject,
      body: 'This is the reply email.',
      sentAt: new Date(),
    })
    .returning();

  assert.ok(savedReplyEmail.id, 'Reply email should be saved to DB');

  // ── Step 8: Verify both emails share the same conversationId ────────────
  assert.equal(
    savedInitialEmail.conversationId,
    savedReplyEmail.conversationId,
    'Both emails must belong to the same conversation'
  );

  // ── Step 9: Verify via DB query that both emails are in the conversation ─
  const emailsInConversation = await db
    .select()
    .from(emailTable)
    .where(eq(emailTable.conversationId, testConversation.id));

  assert.equal(emailsInConversation.length, 2, 'Conversation should contain exactly 2 emails');

  const externalIds = emailsInConversation.map((e) => e.externalMessageId);
  assert.ok(externalIds.includes(rfcMessageId), 'Initial email RFC Message-ID should be in the conversation');
  assert.ok(
    externalIds.includes(replyRfcMessageId ?? replyGmailId),
    'Reply email ID should be in the conversation'
  );

  // ── Cleanup ──────────────────────────────────────────────────────────────
  // Deleting the lead cascades to conversations and emails via FK constraints.
  await db.delete(leads).where(eq(leads.id, testLead.id));
});

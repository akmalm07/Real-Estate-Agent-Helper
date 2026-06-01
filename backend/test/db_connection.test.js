import 'dotenv/config';

import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import {
  users,
  property,
  leads,
  conversations,
  email,
  sms,
  activityLogs,
} from '../db/schema.js';

test('full CRM relational flow (user => property => lead → convo => messages => activity)', async () => {

  /*
  |--------------------------------------------------------------------------
  | 1. CREATE USER
  |--------------------------------------------------------------------------
  */
  const [user] = await db.insert(users).values({
    email: 'test-user@example.com',
    name: 'Test User',
  }).returning();

  assert.ok(user.id);

  /*
  |--------------------------------------------------------------------------
  | 2. CREATE PROPERTY
  |--------------------------------------------------------------------------
  */
  const [prop] = await db.insert(property).values({
    user_id: user.id,
    status: 'open',
    addressLine1: '123 Main St',
    addressLine2: 'Unit 2',
    description: 'Test property',
  }).returning();

  assert.ok(prop.id);

  /*
  |--------------------------------------------------------------------------
  | 3. CREATE LEAD (linked to property)
  |--------------------------------------------------------------------------
  */
  const [lead] = await db.insert(leads).values({
    userId: prop.id,
    name: 'Test Lead',
    email: 'lead@example.com',
    phone: '1234567890',
    source: 'test',
    status: 'new',
  }).returning();

  assert.ok(lead.id);

  /*
  |--------------------------------------------------------------------------
  | 4. CREATE CONVERSATION
  |--------------------------------------------------------------------------
  */
  const [conversation] = await db.insert(conversations).values({
    leadId: lead.id,
    type: 'email',

    initialSender: {
      name: 'Agent',
      email: 'agent@test.com',
    },

    initialRecipient: [
      {
        name: 'Lead',
        email: 'lead@example.com',
      },
    ],

    externalThreadId: 'thread_test_123',
  }).returning();

  assert.ok(conversation.id);

  /*
  |--------------------------------------------------------------------------
  | 5. INSERT EMAIL
  |--------------------------------------------------------------------------
  */
  const [insertedEmail] = await db.insert(email).values({
    conversationId: conversation.id,
    direction: 'outbound',

    sender: {
      name: 'Agent',
      email: 'agent@test.com',
    },

    recipient: [
      {
        name: 'Lead',
        email: 'lead@example.com',
      },
    ],

    cc: [],

    subject: 'Test Subject',
    body: 'Hello world',
  }).returning();

  assert.ok(insertedEmail.id);

  /*
  |--------------------------------------------------------------------------
  | 6. INSERT SMS (NEW TABLE TEST)
  |--------------------------------------------------------------------------
  */
  const [insertedSms] = await db.insert(sms).values({
    conversationId: conversation.id,
    direction: 'outbound',
    body: 'Test SMS message',
  }).returning();

  assert.ok(insertedSms.id);

  /*
  |--------------------------------------------------------------------------
  | 7. INSERT ACTIVITY LOG (NEW CORE FEATURE)
  |--------------------------------------------------------------------------
  */
  const [activity] = await db.insert(activityLogs).values({
    leadId: lead.id,
    entityType: 'email',
    entityId: insertedEmail.id,

    metadata: {
      subject: 'Test Subject',
      channel: 'email',
    },

    description: 'Email sent to lead',
  }).returning();

  assert.ok(activity.id);

  /*
  |--------------------------------------------------------------------------
  | 8. VERIFY EMAIL
  |--------------------------------------------------------------------------
  */
  const rows = await db
    .select()
    .from(email)
    .where(eq(email.id, insertedEmail.id));

  assert.equal(rows.length, 1);

  const row = rows[0];

  assert.equal(row.subject, 'Test Subject');
  assert.equal(row.sender.email, 'agent@test.com');
  assert.equal(row.recipient.length, 1);

  /*
  |--------------------------------------------------------------------------
  | 9. CLEANUP
  |--------------------------------------------------------------------------
  */
  await db.delete(activityLogs).where(eq(activityLogs.id, activity.id));
  await db.delete(sms).where(eq(sms.id, insertedSms.id));
  await db.delete(email).where(eq(email.id, insertedEmail.id));
  await db.delete(conversations).where(eq(conversations.id, conversation.id));
  await db.delete(leads).where(eq(leads.id, lead.id));
  await db.delete(property).where(eq(property.id, prop.id));
  await db.delete(users).where(eq(users.id, user.id));
});
import 'dotenv/config';

import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import {
  users,
  properties,
  leads,
  conversations,
  email,
  sms,
  activityLogs,
} from '../db/schema.js';

test('full CRM relational flow (user => property => lead => convo => messages => activity)', async () => {

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
  assert.equal(user.email, 'test-user@example.com');

  /*
  |--------------------------------------------------------------------------
  | 2. CREATE PROPERTY
  |--------------------------------------------------------------------------
  */
  const [prop] = await db.insert(properties).values({
    userId: user.id,
    status: 'open',
    addressLine1: '123 Main St',
    addressLine2: 'Unit 2',
    description: 'Test property',
    source: 'unknown',
  }).returning();

  assert.ok(prop.id);
  assert.equal(prop.status, 'open');

  /*
  |--------------------------------------------------------------------------
  | 3. CREATE LEAD linked to property
  |--------------------------------------------------------------------------
  */
  const [lead] = await db.insert(leads).values({
    propertyId: prop.id,
    userId: user.id,
    name: 'Test Lead',
    email: 'lead@example.com',
    phone: '1234567890',
    source: 'zillow',
    status: 'active',
  }).returning();

  assert.ok(lead.id);
  assert.equal(lead.propertyId, prop.id);
  assert.equal(lead.status, 'active');

  /*
  |--------------------------------------------------------------------------
  | 4. CREATE LEAD with no property (unassigned — agent assigns later)
  |--------------------------------------------------------------------------
  */
  const [unassignedLead] = await db.insert(leads).values({
    propertyId: null,
    userId: user.id,
    name: 'Unassigned Lead',
    email: 'unassigned@example.com',
    phone: '0987654321',
    source: 'realtor',
    status: 'active',
  }).returning();

  assert.ok(unassignedLead.id);
  assert.equal(unassignedLead.propertyId, null);

  /*
  |--------------------------------------------------------------------------
  | 5. CREATE CONVERSATION
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
    createdAt: new Date(),
  }).returning();

  assert.ok(conversation.id);
  assert.equal(conversation.leadId, lead.id);
  assert.equal(conversation.type, 'email');

  /*
  |--------------------------------------------------------------------------
  | 6. INSERT EMAIL
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
  assert.equal(insertedEmail.subject, 'Test Subject');
  assert.equal(insertedEmail.direction, 'outbound');

  /*
  |--------------------------------------------------------------------------
  | 7. INSERT SMS
  |--------------------------------------------------------------------------
  */
  const [insertedSms] = await db.insert(sms).values({
    conversationId: conversation.id,
    direction: 'outbound',
    body: 'Test SMS message',
  }).returning();

  assert.ok(insertedSms.id);
  assert.equal(insertedSms.body, 'Test SMS message');

  /*
  |--------------------------------------------------------------------------
  | 8. INSERT ACTIVITY LOG
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
  assert.equal(activity.entityType, 'email');
  assert.equal(activity.leadId, lead.id);

  /*
  |--------------------------------------------------------------------------
  | 9. VERIFY EMAIL row in DB
  |--------------------------------------------------------------------------
  */
  const emailRows = await db
    .select()
    .from(email)
    .where(eq(email.id, insertedEmail.id));

  assert.equal(emailRows.length, 1);
  assert.equal(emailRows[0].subject, 'Test Subject');
  assert.equal(emailRows[0].sender.email, 'agent@test.com');
  assert.equal(emailRows[0].recipient.length, 1);
  assert.equal(emailRows[0].cc.length, 0);

  /*
  |--------------------------------------------------------------------------
  | 10. VERIFY unassigned lead has null propertyId
  |--------------------------------------------------------------------------
  */
  const unassignedRows = await db
    .select()
    .from(leads)
    .where(eq(leads.id, unassignedLead.id));

  assert.equal(unassignedRows.length, 1);
  assert.equal(unassignedRows[0].propertyId, null);

  /*
  |--------------------------------------------------------------------------
  | 11. CLEANUP (reverse FK order)
  |--------------------------------------------------------------------------
  */
  await db.delete(activityLogs).where(eq(activityLogs.id, activity.id));
  await db.delete(sms).where(eq(sms.id, insertedSms.id));
  await db.delete(email).where(eq(email.id, insertedEmail.id));
  await db.delete(conversations).where(eq(conversations.id, conversation.id));
  await db.delete(leads).where(eq(leads.id, lead.id));
  await db.delete(leads).where(eq(leads.id, unassignedLead.id));
  await db.delete(properties).where(eq(properties.id, prop.id));
  await db.delete(users).where(eq(users.id, user.id));
});

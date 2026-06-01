import {
  pgTable,
  serial,
  integer,
  text,
  pgEnum,
  boolean,
  timestamp,
  jsonb,
  check
} from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm'

/*
|--------------------------------------------------------------------------
| Enums
|--------------------------------------------------------------------------
*/

export const providerEnum = pgEnum('provider', ['google', 'microsoft'])

export const convoTypeEnum = pgEnum('conversation_type', ['sms', 'email'])

export const messageDirection = pgEnum('message_direction', ['inbound', 'outbound']);

export const propertyStatusEnum = pgEnum('property_status', ['draft', 'open', 'pending_deletion', 'archived'])

export const entityTypeEnum = pgEnum('entity_type', [ 'lead', 'conversation', 'email', 'sms', 'task', 'property', 'custom']);

/*
|--------------------------------------------------------------------------
| Users
|--------------------------------------------------------------------------
*/

export const users = pgTable('users', {
  id: serial('id').primaryKey(),

  email: text('email')
    .notNull()
    .unique(),

  name: text('name')
    .notNull(),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
});

/*
|--------------------------------------------------------------------------
| OAuth Accounts
|--------------------------------------------------------------------------
*/

export const oauthAccounts = pgTable('oauth_accounts', {
  id: serial('id').primaryKey(),

  userId: integer('user_id')
    .references(() => users.id, {
      onDelete: 'cascade'
    })
    .notNull(),

  provider: providerEnum('provider')
    .notNull(),

  providerUserId: text('provider_user_id'),

  refreshToken: text('refresh_token'),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
});

/*
|--------------------------------------------------------------------------
| Property
|--------------------------------------------------------------------------
*/

export const property = pgTable('properties', {
  id: serial('id').primaryKey(),

  user_id: integer('user_id')
    .references(() => users.id, {
      onDelete: 'cascade'
    }),

  status: propertyStatusEnum('status')
    .notNull(),
  
  addressLine1: text('address_line_1')
    .notNull(), 
    
  addressLine2: text('address_line_2'),
  
  description: text('description')
    .notNull(),
  
  deletionDate: timestamp('deletion_date'),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),  
})

/*
|--------------------------------------------------------------------------
| Leads
|--------------------------------------------------------------------------
*/

export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),

  userId: integer('user_id')
    .references(() => property.id, {
      onDelete: 'cascade'
    })
    .notNull(),

  name: text('name'),

  email: text('email'),

//Add rank later ...

  phone: text('phone'),

  source: text('source'),

  status: text('status')
    .default('new'),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
});

/*
|--------------------------------------------------------------------------
| Conversations
|--------------------------------------------------------------------------
*/

export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),

  leadId: integer('lead_id')
    .references(() => leads.id, {
      onDelete: 'cascade'
    })
    .notNull(),

  type: convoTypeEnum('type')
    .notNull(),

  initialSender: jsonb('initial_sender')
    .notNull(),

  initialRecipient: jsonb('initial_recipient')
    .notNull(),

  externalThreadId: text('external_thread_id'),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
},
  (table) => [
    //  recipient must be a non-empty array
    check(
      'initial_recipient_is_non_empty_array',
      sql`
        jsonb_typeof(${table.initialRecipient}) = 'array'
        AND jsonb_array_length(${table.initialRecipient}) > 0
      `
    ),

    // sender must be an object (not array, not scalar)
    check(
      'initial_sender_is_object',
      sql`
        jsonb_typeof(${table.initialSender}) = 'object'
      `
    ),
  ]
);

/*
|--------------------------------------------------------------------------
| Email
|--------------------------------------------------------------------------
*/

export const email = pgTable('email', {
  id: serial('id').primaryKey(),

  conversationId: integer('conversation_id')
    .references(() => conversations.id, {
      onDelete: 'cascade'
    })
    .notNull(),

  externalMessageId: text('external_message_id'),

  direction: messageDirection('direction')
    .notNull(),

  sender: jsonb('sender')
    .notNull(),

  recipient: jsonb('recipient')
    .notNull(),

  cc: jsonb('cc')
    .notNull(),

  subject: text('subject'),

  body: text('body'),

  sentAt: timestamp('sent_at'),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
},

  (table) => [
    // recipient must be a non-empty array
    check(
      'recipient_is_non_empty_array',
      sql`
        jsonb_typeof(${table.recipient}) = 'array'
        AND jsonb_array_length(${table.recipient}) > 0
      `
    ),

    // cc must be an array (can be empty but must be array type)
    check(
      'cc_is_array',
      sql`
        jsonb_typeof(${table.cc}) = 'array'
      `
    ),

    // sender must be an object (not array, not scalar)
    check(
      'sender_is_object',
      sql`
        jsonb_typeof(${table.sender}) = 'object'
      `
    ),
  ]
);

/*
|--------------------------------------------------------------------------
| SMS
|--------------------------------------------------------------------------
*/

export const sms = pgTable('sms', {
  id: serial('id').primaryKey(),

  conversationId: integer('conversation_id')
    .references(() => conversations.id, {
      onDelete: 'cascade'
    })
    .notNull(),

  externalMessageId: text('external_message_id'),

  direction: messageDirection('direction')
    .notNull(),

  body: text('body'),

  sentAt: timestamp('sent_at'),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
});

/*
|--------------------------------------------------------------------------
| Lead Notes
|--------------------------------------------------------------------------
*/

export const leadNotes = pgTable('lead_notes', {
  id: serial('id').primaryKey(),

  leadId: integer('lead_id')
    .references(() => leads.id, {
      onDelete: 'cascade'
    })
    .notNull(),
  
  note: text('note')
    .notNull(),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
});

/*
|--------------------------------------------------------------------------
| Lead Tasks
|--------------------------------------------------------------------------
*/

export const leadTasks = pgTable('lead_tasks', {
  id: serial('id').primaryKey(),

  leadId: integer('lead_id')
    .references(() => leads.id, {
      onDelete: 'cascade'
    })
    .notNull(),

  title: text('title')
    .notNull(),

  completed: boolean('completed')
    .default(false)
    .notNull(),

  dueDate: timestamp('due_date'),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
});

/*
|--------------------------------------------------------------------------
| Activity Log
|--------------------------------------------------------------------------
*/

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),

  leadId: integer('lead_id')
    .references(() => leads.id, {
      onDelete: 'cascade'
    })
    .notNull(),

  entityType: entityTypeEnum('entity_type')
    .notNull(),

  entityId: integer('entity_id')
    .notNull(),
  
  metadata: jsonb('metadata')
    .notNull(),

  description: text('description'),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
});
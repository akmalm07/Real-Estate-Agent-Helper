import {
  pgTable,
  serial,
  integer,
  text,
  pgEnum,
  boolean,
  timestamp,
  jsonb,
  check,
} from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';

/*
|--------------------------------------------------------------------------
| Enums
|--------------------------------------------------------------------------
*/

export const providerEnum = pgEnum('provider', ['google', 'microsoft']);

export const convoTypeEnum = pgEnum('conversation_type', ['sms', 'email']);

export const messageDirection = pgEnum('message_direction', ['inbound', 'outbound']);

export const propertyStatusEnum = pgEnum('property_status', ['draft', 'open', 'pending_deletion', 'archived']);

export const entityTypeEnum = pgEnum('entity_type', ['lead', 'conversation', 'email', 'sms', 'task', 'property', 'custom']);

// Consolidated source enum — used by both leads and properties.
export const sourceEnum = pgEnum('source_type', ['zillow', 'realtor', 'unknown']);

export const conversationStatus = pgEnum('conversation_status', ['active', 'cold', 'converted', 'not_interested', 'opted_out']);

// Status of a lead in the CRM lifecycle.
//   active          — lead is being worked, normal outreach continues
//   ready           — AI detected the lead is ready to book an appointment
//   archived        — lead is no longer active but kept for records
//   pending_deletion — lead is scheduled for deletion
export const leadStatusEnum = pgEnum('lead_status', ['active', 'ready', 'archived', 'pending_deletion']);

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

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
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
      onDelete: 'cascade',
    })
    .notNull(),

  provider: providerEnum('provider')
    .notNull(),

  providerUserId: text('provider_user_id')
    .notNull(),

  refreshToken: text('refresh_token')
    .notNull(),

  // Gmail-specific — null for Microsoft accounts.
  gmailWatchExpiration: timestamp('gmail_watch_expiration', {
    withTimezone: true,
  }),

  // Gmail-specific — null for Microsoft accounts.
  lastHistoryId: text('last_history_id'),

  // Outlook-specific — null for Google accounts.
  lastDeltaLink: text('last_delta_link'),

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

/*
|--------------------------------------------------------------------------
| PropertyCustom Error — Invalid / Expired Refresh Token
|--------------------------------------------------------------------------
*/

export const properties = pgTable('properties', {
  id: serial('id').primaryKey(),

  // Every property must belong to a user (the agent who owns it).
  userId: integer('user_id')
    .references(() => users.id, {
      onDelete: 'cascade',
    })
    .notNull(),

  status: propertyStatusEnum('status')
    .notNull(),

  addressLine1: text('address_line_1')
    .notNull(),

  addressLine2: text('address_line_2'),

  // Nullable — may not be available when a property is auto-created from a lead email.
  description: text('description'),

  deletionDate: timestamp('deletion_date', {
    withTimezone: true,
  }),

  source: sourceEnum('property_source')
    .notNull(),

  externalId: text('external_id'),

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

/*
|--------------------------------------------------------------------------
| Leads
|--------------------------------------------------------------------------
*/

export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),

  // Nullable — a lead may come in without referencing a specific property.
  // An agent can assign it manually later.
  propertyId: integer('property_id')
    .references(() => properties.id, {
      onDelete: 'cascade',
    }),

  userId: integer('user_id')
    .references(() => users.id, {
      onDelete: 'cascade',
    })
    .notNull(),

  name: text('name'),

  email: text('email'),

  phone: text('phone'),

  source: sourceEnum('source')
    .notNull(),

  sourceId: text('source_id'),

  // Current lifecycle status of the lead.
  //   active          — normal outreach in progress
  //   ready           — AI flagged the lead as ready to book an appointment
  //   archived        — no longer active, kept for records
  //   pending_deletion — scheduled for deletion
  status: leadStatusEnum('status')
    .default('active')
    .notNull(),

  // Set when status is 'pending_deletion'. The lead will be deleted on or after this date.
  deletionDate: timestamp('deletion_date', {
    withTimezone: true,
  }),

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
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
      onDelete: 'cascade',
    })
    .notNull(),

  type: convoTypeEnum('type')
    .notNull(),

  initialSender: jsonb('initial_sender')
    .notNull(),

  initialRecipient: jsonb('initial_recipient')
    .notNull(),

  externalThreadId: text('external_thread_id'),

  status: conversationStatus('status')
    .default('active')
    .notNull(),

  followupTime: timestamp('followup_time', {
    withTimezone: true,
  }),

  doNotContactUntil: timestamp('do_not_contact_until', {
    withTimezone: true,
  }),

  lastLeadMessageAt: timestamp('last_lead_message_at', {
    withTimezone: true,
  }),

  lastAgentMessageAt: timestamp('last_agent_message_at', {
    withTimezone: true,
  }),

  unansweredFollowups: integer('unanswered_followups')
    .default(0)
    .notNull(),

  optedOut: boolean('opted_out')
    .default(false)
    .notNull(),

  conversationState: jsonb('conversation_state'),

  // defaultNow() added — was notNull() without a default, requiring manual supply on every insert.
  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

},
  (table) => [
    // recipient must be a non-empty array
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
      onDelete: 'cascade',
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

  sentAt: timestamp('sent_at', {
    withTimezone: true,
  }),

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
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
      onDelete: 'cascade',
    })
    .notNull(),

  externalMessageId: text('external_message_id'),

  direction: messageDirection('direction')
    .notNull(),

  body: text('body')
    .notNull(),

  sentAt: timestamp('sent_at', {
    withTimezone: true,
  }),

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
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
      onDelete: 'cascade',
    })
    .notNull(),

  note: text('note')
    .notNull(),

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
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
      onDelete: 'cascade',
    })
    .notNull(),

  title: text('title')
    .notNull(),

  completed: boolean('completed')
    .default(false)
    .notNull(),

  dueDate: timestamp('due_date', {
    withTimezone: true,
  }),

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
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
      onDelete: 'cascade',
    })
    .notNull(),

  entityType: entityTypeEnum('entity_type')
    .notNull(),

  // No FK constraint — this is a polymorphic reference. The referenced table
  // is determined by entityType (e.g. entityType='email' → email table).
  entityId: integer('entity_id')
    .notNull(),

  metadata: jsonb('metadata')
    .notNull(),

  description: text('description'),

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

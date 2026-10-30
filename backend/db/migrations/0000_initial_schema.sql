-- Full current-schema snapshot, exported offline from backend/db/schema.js.
-- Apply through bootstrap.sql, not directly to an existing schema.
CREATE TYPE "public"."contact_method" AS ENUM('sms', 'email', 'phone', 'mix');
CREATE TYPE "public"."contact_type" AS ENUM('sms', 'email', 'off', 'both');
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'cold', 'converted', 'not_interested', 'opted_out');
CREATE TYPE "public"."conversation_type" AS ENUM('sms', 'email');
CREATE TYPE "public"."entity_type" AS ENUM('lead', 'conversation', 'email', 'sms', 'task', 'property', 'custom');
CREATE TYPE "public"."lead_status" AS ENUM('unverified', 'active', 'ready', 'archived', 'pending_deletion');
CREATE TYPE "public"."leads_per_month" AS ENUM('0_25', '25_50', '50_100', '100_plus');
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');
CREATE TYPE "public"."property_source_type" AS ENUM('zillow', 'realtor', 'listing');
CREATE TYPE "public"."property_status" AS ENUM('draft', 'open', 'pending_deletion', 'archived');
CREATE TYPE "public"."provider" AS ENUM('google', 'microsoft');
CREATE TYPE "public"."source_type" AS ENUM('zillow', 'realtor', 'referral', 'email', 'unknown');
CREATE TYPE "public"."team_size" AS ENUM('just_me', '2_5', '6_20', '20_plus');
CREATE TYPE "public"."user_source" AS ENUM('google', 'microsoft', 'manual');
CREATE TABLE "activity_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "lead_id" integer NOT NULL,
  "entity_type" "entity_type" NOT NULL,
  "entity_id" integer NOT NULL,
  "metadata" jsonb NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "confirmation_codes" (
  "email" text NOT NULL,
  "code" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "confirmation_codes_email_unique" UNIQUE("email"),
  CONSTRAINT "confirmation_code_six_digits" CHECK ("confirmation_codes"."code" >= 100000 AND "confirmation_codes"."code" <= 999999)
);
CREATE TABLE "conversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "lead_id" integer NOT NULL,
  "type" "conversation_type" NOT NULL,
  "initial_sender" jsonb NOT NULL,
  "initial_recipient" jsonb NOT NULL,
  "external_thread_id" text,
  "status" "conversation_status" DEFAULT 'active' NOT NULL,
  "followup_time" timestamp with time zone,
  "do_not_contact_until" timestamp with time zone,
  "last_lead_message_at" timestamp with time zone,
  "last_agent_message_at" timestamp with time zone,
  "unanswered_followups" integer DEFAULT 0 NOT NULL,
  "opted_out" boolean DEFAULT false NOT NULL,
  "conversation_state" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "initial_recipient_is_non_empty_array" CHECK (
        jsonb_typeof("conversations"."initial_recipient") = 'array'
        AND jsonb_array_length("conversations"."initial_recipient") > 0
      ),
  CONSTRAINT "initial_sender_is_object" CHECK (
        jsonb_typeof("conversations"."initial_sender") = 'object'
      )
);
CREATE TABLE "email" (
  "id" serial PRIMARY KEY NOT NULL,
  "conversation_id" integer NOT NULL,
  "external_message_id" text,
  "direction" "message_direction" NOT NULL,
  "sender" jsonb NOT NULL,
  "in_reply_to_id" text,
  "recipient" jsonb NOT NULL,
  "cc" jsonb NOT NULL,
  "subject" text,
  "body" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "recipient_is_non_empty_array" CHECK (
        jsonb_typeof("email"."recipient") = 'array'
        AND jsonb_array_length("email"."recipient") > 0
      ),
  CONSTRAINT "cc_is_array" CHECK (
        jsonb_typeof("email"."cc") = 'array'
      ),
  CONSTRAINT "sender_is_object" CHECK (
        jsonb_typeof("email"."sender") = 'object'
      )
);
CREATE TABLE "lead_notes" (
  "id" serial PRIMARY KEY NOT NULL,
  "lead_id" integer NOT NULL,
  "note" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "lead_parse_corrections" (
  "id" serial PRIMARY KEY NOT NULL,
  "lead_id" integer,
  "raw_subject" text,
  "raw_body" text,
  "raw_from" text,
  "detected_source" text,
  "detected_name" text,
  "detected_email" text,
  "detected_phone" text,
  "detected_confidence" numeric(4, 3),
  "corrected_source" text,
  "corrected_name" text,
  "corrected_email" text,
  "corrected_phone" text,
  "changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "parser_version" text NOT NULL,
  "matched_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "lead_tasks" (
  "id" serial PRIMARY KEY NOT NULL,
  "lead_id" integer NOT NULL,
  "title" text NOT NULL,
  "completed" boolean DEFAULT false NOT NULL,
  "due_date" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "leads" (
  "id" serial PRIMARY KEY NOT NULL,
  "property_id" integer,
  "user_id" integer NOT NULL,
  "name" text,
  "email" text,
  "phone" text,
  "source" "source_type" NOT NULL,
  "source_id" text,
  "status" "lead_status" DEFAULT 'active' NOT NULL,
  "ai_enabled" boolean DEFAULT true NOT NULL,
  "deletion_date" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "oauth_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "provider" "provider" NOT NULL,
  "provider_user_id" text NOT NULL,
  "refresh_token" text NOT NULL,
  "gmail_watch_expiration" timestamp with time zone,
  "last_history_id" text,
  "last_delta_link" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "properties" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "status" "property_status" NOT NULL,
  "address_line_1" text NOT NULL,
  "address_line_2" text,
  "description" text,
  "price" numeric(12, 2),
  "bedrooms" integer,
  "bathrooms" numeric(4, 1),
  "sqft" integer,
  "deletion_date" timestamp with time zone,
  "property_source" "property_source_type" DEFAULT 'listing' NOT NULL,
  "external_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "sms" (
  "id" serial PRIMARY KEY NOT NULL,
  "conversation_id" integer NOT NULL,
  "external_message_id" text,
  "direction" "message_direction" NOT NULL,
  "body" text NOT NULL,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "user_onboarding" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "brokerage" text NOT NULL,
  "primary_market" text,
  "leads_per_month" "leads_per_month",
  "lead_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "lead_source_other" text,
  "contact_method" "contact_method" NOT NULL,
  "team_size" "team_size",
  "biggest_challenge" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_onboarding_user_id_unique" UNIQUE("user_id")
);
CREATE TABLE "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "onboard_complete" boolean DEFAULT false NOT NULL,
  "email_confirmed" boolean DEFAULT false NOT NULL,
  "name" text NOT NULL,
  "notify_new_lead" "contact_type" DEFAULT 'off' NOT NULL,
  "notify_new_message" "contact_type" DEFAULT 'off' NOT NULL,
  "notify_weekly_summery" "contact_type" DEFAULT 'off' NOT NULL,
  "phone" text,
  "password_hash" text,
  "source" "user_source",
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "email" ADD CONSTRAINT "email_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lead_parse_corrections" ADD CONSTRAINT "lead_parse_corrections_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "leads" ADD CONSTRAINT "leads_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "leads" ADD CONSTRAINT "leads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "properties" ADD CONSTRAINT "properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sms" ADD CONSTRAINT "sms_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_onboarding" ADD CONSTRAINT "user_onboarding_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "confirmation_email_unique" ON "confirmation_codes" USING btree ("email");

-- Explicit psql recipe for EMPTY or CURRENT public schemas only.
-- Not an arbitrary historical upgrade runner. Never resets or deletes data.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = public;
-- Serialize concurrent invocations of this recipe in the same database.
SELECT pg_advisory_xact_lock(9427723);
SELECT NOT EXISTS (
  SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace
) AND NOT EXISTS (
  SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace
) AND NOT EXISTS (
  SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
) AS bootstrap_empty \gset
\if :bootstrap_empty
  \ir 0000_initial_schema.sql
\else
  -- Reject obvious partial/foreign schemas before applying any alterations.
  -- This is a shape guard, not a guarantee of arbitrary historical compatibility.
  DO $$
  BEGIN
    IF (SELECT count(*) FROM pg_tables WHERE schemaname='public') <> 13
      OR (SELECT count(*) FROM pg_type WHERE typnamespace='public'::regnamespace AND typtype='e') <> 14
      OR EXISTS (
        SELECT 1 FROM (VALUES
          ('activity_logs', 7), ('confirmation_codes', 3), ('conversations', 16),
          ('email', 12), ('lead_notes', 4), ('lead_parse_corrections', 18),
          ('lead_tasks', 6), ('leads', 13), ('oauth_accounts', 9),
          ('properties', 14), ('sms', 7), ('user_onboarding', 13), ('users', 12)
        ) AS expected(name, columns)
        WHERE (SELECT count(*) FROM information_schema.columns c
               WHERE c.table_schema='public' AND c.table_name=expected.name) <> expected.columns
      ) THEN
      RAISE EXCEPTION 'Unsupported or partial public schema; bootstrap requires an empty or current schema';
    END IF;
  END $$;
\endif
\ir 0001_add_property_details.sql
\ir 0002_add_ai_enabled_to_leads.sql
COMMIT;

-- Synthetic only. The caller controls COMMIT/ROLLBACK.
INSERT INTO users (id, email, name, source) VALUES (91001, 'bootstrap@example.invalid', 'Bootstrap fixture', 'manual');
INSERT INTO oauth_accounts (user_id, provider, provider_user_id, refresh_token)
VALUES (91001, 'google', 'synthetic-user', 'synthetic-not-a-credential');
INSERT INTO user_onboarding (user_id, brokerage, contact_method, completed_at)
VALUES (91001, 'Synthetic brokerage', 'email', now());
INSERT INTO confirmation_codes (email, code) VALUES ('bootstrap@example.invalid', 123456);
INSERT INTO properties (id, user_id, status, address_line_1)
VALUES (91001, 91001, 'open', '1 Synthetic Lane');
INSERT INTO properties (user_id, status, address_line_1, property_source)
SELECT 91001, 'draft', 'Synthetic ' || source, source::property_source_type
FROM unnest(ARRAY['zillow', 'realtor', 'listing']) AS source;
INSERT INTO leads (id, user_id, property_id, name, email, source)
VALUES (91001, 91001, 91001, 'Synthetic lead', 'lead@example.invalid', 'referral');
INSERT INTO lead_notes (lead_id, note) VALUES (91001, 'Synthetic note');
INSERT INTO lead_tasks (lead_id, title) VALUES (91001, 'Synthetic task');
INSERT INTO lead_parse_corrections (lead_id, parser_version) VALUES (91001, 'synthetic-test');
INSERT INTO conversations (id, lead_id, type, initial_sender, initial_recipient)
VALUES (91001, 91001, 'email', '{"email":"lead@example.invalid"}', '[{"email":"bootstrap@example.invalid"}]'),
       (91002, 91001, 'sms', '{"phone":"synthetic"}', '[{"phone":"synthetic"}]');
INSERT INTO email (conversation_id, direction, sender, recipient, cc, body)
VALUES (91001, 'inbound', '{}', '[{}]', '[]', 'Synthetic email');
INSERT INTO sms (conversation_id, direction, body) VALUES (91002, 'outbound', 'Synthetic SMS');
INSERT INTO activity_logs (lead_id, entity_type, entity_id, metadata) VALUES (91001, 'lead', 91001, '{}');
DO $$
BEGIN
  IF (SELECT count(*) FROM users u JOIN properties p ON p.user_id=u.id
      JOIN leads l ON l.property_id=p.id JOIN lead_notes n ON n.lead_id=l.id
      JOIN lead_tasks t ON t.lead_id=l.id JOIN conversations c ON c.lead_id=l.id
      LEFT JOIN email e ON e.conversation_id=c.id LEFT JOIN sms s ON s.conversation_id=c.id
      WHERE u.id=91001 AND (e.body='Synthetic email' OR s.body='Synthetic SMS')) <> 2 THEN
    RAISE EXCEPTION 'Relational join failed';
  END IF;
  IF (SELECT property_source FROM properties WHERE id=91001) <> 'listing' THEN
    RAISE EXCEPTION 'Wrong default property source';
  END IF;
  BEGIN
    INSERT INTO properties (user_id, status, address_line_1, property_source) VALUES (91001, 'open', 'invalid', 'unknown');
    RAISE EXCEPTION 'Invalid enum accepted';
  EXCEPTION WHEN SQLSTATE '22P02' THEN NULL;
  END;
  BEGIN
    INSERT INTO lead_notes (lead_id, note) VALUES (-1, 'Invalid FK');
    RAISE EXCEPTION 'Invalid FK accepted';
  EXCEPTION WHEN SQLSTATE '23503' THEN NULL;
  END;
  BEGIN
    INSERT INTO properties (user_id, status, address_line_1) VALUES (-1, 'open', 'Invalid FK');
    RAISE EXCEPTION 'Invalid property FK accepted';
  EXCEPTION WHEN SQLSTATE '23503' THEN NULL;
  END;
  BEGIN
    INSERT INTO users (email, name) VALUES ('bootstrap@example.invalid', 'Duplicate');
    RAISE EXCEPTION 'Duplicate accepted';
  EXCEPTION WHEN SQLSTATE '23505' THEN NULL;
  END;
  BEGIN
    INSERT INTO users (email) VALUES ('null@example.invalid');
    RAISE EXCEPTION 'Null accepted';
  EXCEPTION WHEN SQLSTATE '23502' THEN NULL;
  END;
  BEGIN
    INSERT INTO confirmation_codes (email, code) VALUES ('invalid@example.invalid', 1);
    RAISE EXCEPTION 'Invalid confirmation code accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    INSERT INTO conversations (lead_id, type, initial_sender, initial_recipient) VALUES (91001, 'email', '{}', '[]');
    RAISE EXCEPTION 'Empty recipient accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    INSERT INTO email (conversation_id, direction, sender, recipient, cc) VALUES (91001, 'inbound', '[]', '[{}]', '[]');
    RAISE EXCEPTION 'Invalid sender accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    INSERT INTO conversations (lead_id, type, initial_sender, initial_recipient) VALUES (91001, 'sms', '[]', '[{}]');
    RAISE EXCEPTION 'Invalid initial sender accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    INSERT INTO email (conversation_id, direction, sender, recipient, cc) VALUES (91001, 'inbound', '{}', '[]', '[]');
    RAISE EXCEPTION 'Invalid email recipient accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    INSERT INTO email (conversation_id, direction, sender, recipient, cc) VALUES (91001, 'inbound', '{}', '[{}]', '{}');
    RAISE EXCEPTION 'Invalid cc accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END $$;

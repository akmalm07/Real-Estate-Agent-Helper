-- Migration: add aiEnabled to leads table
-- Run this against your database before deploying the updated schema.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT TRUE;

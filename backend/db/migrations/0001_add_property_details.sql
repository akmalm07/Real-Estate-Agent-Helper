-- Migration: add price, bedrooms, bathrooms, sqft to properties table
-- Run this against your database before deploying the updated schema.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS price     NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS bedrooms  INTEGER,
  ADD COLUMN IF NOT EXISTS bathrooms NUMERIC(4, 1),
  ADD COLUMN IF NOT EXISTS sqft      INTEGER;

-- Also make source nullable-safe with a default if not already set
ALTER TABLE properties
  ALTER COLUMN property_source SET DEFAULT 'listing';

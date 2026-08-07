-- Per-unit lease template / upload configuration for application lease generation
ALTER TABLE apartments
  ADD COLUMN IF NOT EXISTS lease_config JSONB;

-- Soft-delete units so they can appear under Previous units
ALTER TABLE apartments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_apartments_org_active
  ON apartments (org_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_apartments_org_deleted
  ON apartments (org_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

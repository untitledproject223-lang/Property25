-- Document binary storage in Neon (no Mongo required for Phase 1)
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS content_base64 TEXT;

CREATE TABLE IF NOT EXISTS landlord_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  landlord_id UUID NOT NULL REFERENCES landlords(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'phone', 'note')),
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landlord_updates_org ON landlord_updates(org_id, at DESC);

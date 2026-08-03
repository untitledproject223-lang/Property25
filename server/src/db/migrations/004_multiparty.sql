-- Multi-party portals: tenant/landlord accounts, invites, application payloads, issues

ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS applicant_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE apartments
  ADD COLUMN IF NOT EXISTS ticket_manager TEXT NOT NULL DEFAULT 'landlord'
    CHECK (ticket_manager IN ('landlord', 'agent'));

CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('tenant', 'landlord')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  landlord_id UUID REFERENCES landlords(id) ON DELETE SET NULL,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invites_org_email ON invites(org_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token_hash);

CREATE TABLE IF NOT EXISTS application_payloads (
  application_id UUID PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  form_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS issue_type TEXT NOT NULL DEFAULT 'general'
    CHECK (issue_type IN ('maintenance', 'general', 'invoice'));

ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS management_owner TEXT NOT NULL DEFAULT 'landlord'
    CHECK (management_owner IN ('landlord', 'agent'));

ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS decision_json JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Allow rejected status for maintenance workflow
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_status_check;
ALTER TABLE issues
  ADD CONSTRAINT issues_status_check
  CHECK (status IN ('open', 'pending', 'resolved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_tenants_user ON tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_landlords_user ON landlords(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_applicant_user ON applications(applicant_user_id);

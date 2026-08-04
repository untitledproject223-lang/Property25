-- Link tenants to the application that onboarded them and support profile avatars.
-- Remove confusing non-application / smoke-test tenant rows.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_application ON tenants(application_id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_base64 TEXT,
  ADD COLUMN IF NOT EXISTS avatar_mime TEXT;

-- Remove smoke-test / QA tenants that were never created via applications
DELETE FROM tenants
WHERE application_id IS NULL
  AND (
    lower(name) LIKE '%smoke test%'
    OR lower(email) LIKE '%smoke%test%'
    OR lower(name) LIKE '%test tenant%'
  );

-- Orphan tenants with no application link and no portal user are not real onboardings
DELETE FROM tenants
WHERE application_id IS NULL
  AND user_id IS NULL;

-- Units marked occupied with no active application-linked tenant → vacant
UPDATE apartments a
SET status = 'vacant', updated_at = now()
WHERE a.status = 'occupied'
  AND NOT EXISTS (
    SELECT 1 FROM tenants t
    WHERE t.apartment_id = a.id
      AND t.status IN ('active', 'notice')
      AND t.application_id IS NOT NULL
  );

-- Backfill application_id from completed applications that stored tenantId in form_json
UPDATE tenants t
SET application_id = a.id
FROM applications a
JOIN application_payloads p ON p.application_id = a.id
WHERE t.application_id IS NULL
  AND a.org_id = t.org_id
  AND a.status = 'tenant'
  AND (
    p.form_json->>'tenantId' = t.id::text
    OR lower(a.applicant_email) = lower(t.email)
  );

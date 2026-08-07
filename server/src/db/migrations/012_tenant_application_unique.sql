-- Close duplicate *current* leases for the same application (keep one)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY application_id
      ORDER BY
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST
    ) AS rn
  FROM tenants
  WHERE application_id IS NOT NULL
    AND status IN ('active', 'notice')
)
UPDATE tenants t
SET
  status = 'former',
  terminated_at = COALESCE(t.terminated_at, CURRENT_DATE),
  termination_reason = COALESCE(
    t.termination_reason,
    'Closed duplicate lease record for the same application'
  ),
  updated_at = now()
FROM ranked r
WHERE t.id = r.id
  AND r.rn > 1;

-- At most one current lease per application
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_application_active_unique
  ON tenants (application_id)
  WHERE application_id IS NOT NULL
    AND status IN ('active', 'notice');

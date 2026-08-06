-- Lease termination audit fields
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS termination_reason TEXT,
  ADD COLUMN IF NOT EXISTS deposit_paid_out BOOLEAN,
  ADD COLUMN IF NOT EXISTS terminated_at DATE;

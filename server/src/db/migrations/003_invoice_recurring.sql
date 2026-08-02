-- Recurring vs one-time invoice billing
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS billing_kind TEXT NOT NULL DEFAULT 'one_time'
    CHECK (billing_kind IN ('recurring', 'one_time'));

UPDATE invoices
SET billing_kind = CASE WHEN is_recurring THEN 'recurring' ELSE 'one_time' END
WHERE billing_kind IS NULL OR billing_kind = 'one_time';

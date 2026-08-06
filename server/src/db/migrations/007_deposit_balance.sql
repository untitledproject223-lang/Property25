-- Track remaining deposit balance for maintenance deductions
ALTER TABLE apartments
  ADD COLUMN IF NOT EXISTS deposit_balance NUMERIC(12, 2);

UPDATE apartments
SET deposit_balance = deposit
WHERE deposit_balance IS NULL;

ALTER TABLE apartments
  ALTER COLUMN deposit_balance SET DEFAULT 0;

ALTER TABLE apartments
  ALTER COLUMN deposit_balance SET NOT NULL;

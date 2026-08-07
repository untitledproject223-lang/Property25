-- Unit finance / ownership details for landlord portfolio summary
ALTER TABLE apartments
  ADD COLUMN IF NOT EXISTS postal_code TEXT;

ALTER TABLE apartments
  ADD COLUMN IF NOT EXISTS levies NUMERIC(12, 2);

ALTER TABLE apartments
  ADD COLUMN IF NOT EXISTS municipal NUMERIC(12, 2);

ALTER TABLE apartments
  ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12, 2);

ALTER TABLE apartments
  ADD COLUMN IF NOT EXISTS bank_owed NUMERIC(12, 2);

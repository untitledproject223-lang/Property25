-- Link invoices to maintenance tickets when the tenant is billed
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS issue_id UUID REFERENCES issues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_issue ON invoices (issue_id)
  WHERE issue_id IS NOT NULL;

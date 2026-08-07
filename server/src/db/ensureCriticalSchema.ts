import { sql } from './client.js'

/**
 * Critical schema patches that must run even if .sql migration files
 * are missing from the deployed dist/ bundle.
 */
export async function ensureCriticalSchema() {
  await sql.query(`
    ALTER TABLE apartments
      ADD COLUMN IF NOT EXISTS deposit_balance NUMERIC(12, 2)
  `)

  await sql.query(`
    UPDATE apartments
    SET deposit_balance = deposit
    WHERE deposit_balance IS NULL
  `)

  await sql.query(`
    ALTER TABLE apartments
      ALTER COLUMN deposit_balance SET DEFAULT 0
  `)

  await sql.query(`
    ALTER TABLE apartments
      ALTER COLUMN deposit_balance SET NOT NULL
  `)

  await sql.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  await sql.query(`
    INSERT INTO schema_migrations (id)
    VALUES ('007_deposit_balance.sql')
    ON CONFLICT (id) DO NOTHING
  `)

  await sql.query(`
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS termination_reason TEXT
  `)
  await sql.query(`
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS deposit_paid_out BOOLEAN
  `)
  await sql.query(`
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS terminated_at DATE
  `)
  await sql.query(`
    INSERT INTO schema_migrations (id)
    VALUES ('008_lease_termination.sql')
    ON CONFLICT (id) DO NOTHING
  `)

  await sql.query(`
    ALTER TABLE apartments
      ADD COLUMN IF NOT EXISTS managing_agent_id UUID REFERENCES users(id) ON DELETE SET NULL
  `)

  await sql.query(`
    CREATE TABLE IF NOT EXISTS unit_agent_invites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      apartment_id UUID NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ,
      accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
      invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  await sql.query(`
    CREATE INDEX IF NOT EXISTS idx_unit_agent_invites_token
      ON unit_agent_invites(token_hash)
  `)

  await sql.query(`
    INSERT INTO schema_migrations (id)
    VALUES ('009_managing_agent.sql')
    ON CONFLICT (id) DO NOTHING
  `)

  await sql.query(`
    ALTER TABLE apartments
      ADD COLUMN IF NOT EXISTS postal_code TEXT
  `)
  await sql.query(`
    ALTER TABLE apartments
      ADD COLUMN IF NOT EXISTS levies NUMERIC(12, 2)
  `)
  await sql.query(`
    ALTER TABLE apartments
      ADD COLUMN IF NOT EXISTS municipal NUMERIC(12, 2)
  `)
  await sql.query(`
    ALTER TABLE apartments
      ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12, 2)
  `)
  await sql.query(`
    ALTER TABLE apartments
      ADD COLUMN IF NOT EXISTS bank_owed NUMERIC(12, 2)
  `)
  await sql.query(`
    INSERT INTO schema_migrations (id)
    VALUES ('010_unit_finance.sql')
    ON CONFLICT (id) DO NOTHING
  `)

  console.log('schema: deposit_balance + lease termination + managing agent + unit finance ready')
}

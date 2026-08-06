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

  console.log('schema: deposit_balance ready')
}

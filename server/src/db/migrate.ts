import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../.env') })

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is missing. Copy server/.env.example to server/.env and paste your Neon URL.')
  process.exit(1)
}

const sql = neon(databaseUrl)

function splitSqlStatements(sqlText: string): string[] {
  return sqlText
    .split(';')
    .map((part) =>
      part
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((stmt) => stmt.length > 0)
}

async function migrate() {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const migrationsDir = join(__dirname, 'migrations')
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const applied = await sql`SELECT id FROM schema_migrations WHERE id = ${file}`
    if (applied.length > 0) {
      console.log(`skip  ${file}`)
      continue
    }

    const body = readFileSync(join(migrationsDir, file), 'utf8')
    const statements = splitSqlStatements(body)

    for (const statement of statements) {
      await sql.query(statement)
    }

    await sql`INSERT INTO schema_migrations (id) VALUES (${file})`
    console.log(`apply ${file} (${statements.length} statements)`)
  }

  console.log('Migrations complete.')
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})

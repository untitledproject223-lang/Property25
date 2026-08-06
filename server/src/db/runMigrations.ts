import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from './client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

function resolveMigrationsDir(): string {
  const candidates = [
    join(__dirname, 'migrations'),
    join(__dirname, '../../src/db/migrations'),
    join(process.cwd(), 'src/db/migrations'),
  ]
  for (const dir of candidates) {
    if (existsSync(dir)) return dir
  }
  throw new Error(`Migrations directory not found. Tried: ${candidates.join(', ')}`)
}

/** Apply pending SQL migrations. Safe to call on every process start. */
export async function runMigrations() {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const migrationsDir = resolveMigrationsDir()
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const applied = await sql`SELECT id FROM schema_migrations WHERE id = ${file}`
    if (applied.length > 0) {
      console.log(`migrate: skip  ${file}`)
      continue
    }

    const body = readFileSync(join(migrationsDir, file), 'utf8')
    const statements = splitSqlStatements(body)

    for (const statement of statements) {
      await sql.query(statement)
    }

    await sql`INSERT INTO schema_migrations (id) VALUES (${file})`
    console.log(`migrate: apply ${file} (${statements.length} statements)`)
  }

  console.log('migrate: complete')
}

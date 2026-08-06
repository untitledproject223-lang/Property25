import { createApp } from './app.js'
import { env } from './config/env.js'
import { pingDatabase } from './db/client.js'
import { ensureCriticalSchema } from './db/ensureCriticalSchema.js'
import { runMigrations } from './db/runMigrations.js'

async function main() {
  // Fail fast if Neon is unreachable
  const db = await pingDatabase()
  console.log(`Connected to Neon at ${db.now}`)

  // Apply critical columns first (does not depend on shipping .sql files in dist/)
  await ensureCriticalSchema()

  // Apply any remaining file-based migrations when available
  try {
    await runMigrations()
  } catch (err) {
    console.warn('File migrations skipped or failed:', err)
  }

  const app = createApp()
  app.listen(env.PORT, () => {
    console.log(`Property25 API listening on http://localhost:${env.PORT}`)
  })
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

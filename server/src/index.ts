import { createApp } from './app.js'
import { env } from './config/env.js'
import { pingDatabase } from './db/client.js'

async function main() {
  // Fail fast if Neon is unreachable
  const db = await pingDatabase()
  console.log(`Connected to Neon at ${db.now}`)

  const app = createApp()
  app.listen(env.PORT, () => {
    console.log(`Property25 API listening on http://localhost:${env.PORT}`)
  })
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

import { runMigrations } from './runMigrations.js'

runMigrations()
  .then(() => {
    console.log('Migrations complete.')
  })
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })

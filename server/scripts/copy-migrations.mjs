import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src', 'db', 'migrations')
const dest = join(root, 'dist', 'db', 'migrations')

if (!existsSync(src)) {
  console.error('No migrations found at', src)
  process.exit(1)
}

mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log('Copied SQL migrations to dist/db/migrations')

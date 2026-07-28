import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../.env') })

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is missing.')
  process.exit(1)
}

const sql = neon(databaseUrl)

const DEMO_EMAIL = 'admin@demo-agency.test'
const DEMO_PASSWORD = 'Demo1234!'

async function seed() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

  const existing = await sql`SELECT id FROM organisations WHERE slug = 'demo-agency' LIMIT 1`

  if (existing.length > 0) {
    const orgId = existing[0].id
    await sql`
      UPDATE users
      SET password_hash = ${passwordHash}, updated_at = now()
      WHERE lower(email) = lower(${DEMO_EMAIL})
    `
    console.log('Demo agency already exists — password refreshed.')
    console.log(`  org_id:  ${orgId}`)
    console.log(`  login:   ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)
    return
  }

  const [org] = await sql`
    INSERT INTO organisations (name, slug)
    VALUES ('Demo Agency', 'demo-agency')
    RETURNING id
  `

  const [user] = await sql`
    INSERT INTO users (email, full_name, password_hash)
    VALUES (${DEMO_EMAIL}, 'Demo Admin', ${passwordHash})
    RETURNING id
  `

  await sql`
    INSERT INTO org_members (org_id, user_id, role)
    VALUES (${org.id}, ${user.id}, 'admin')
  `

  await sql`
    INSERT INTO billing_accounts (org_id, plan_tier, credit_balance)
    VALUES (${org.id}, 'starter', 50)
  `

  const [building] = await sql`
    INSERT INTO buildings (org_id, name, address)
    VALUES (${org.id}, 'Harbor View Residences', '18 Quayside Road, Cape Town')
    RETURNING id
  `

  const [landlord] = await sql`
    INSERT INTO landlords (org_id, name, email, phone, whatsapp)
    VALUES (${org.id}, 'Priya Naidoo', 'priya.naidoo@example.com', '+27821234501', '27821234501')
    RETURNING id
  `

  await sql`
    INSERT INTO apartments (org_id, building_id, landlord_id, unit_number, rent, deposit, status, next_due_date)
    VALUES
      (${org.id}, ${building.id}, ${landlord.id}, '4B', 14500, 29000, 'occupied', '2026-08-01'),
      (${org.id}, ${building.id}, ${landlord.id}, '7C', 16000, 32000, 'vacant', NULL)
  `

  console.log('Seed complete.')
  console.log(`  org_id:  ${org.id}`)
  console.log(`  login:   ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})

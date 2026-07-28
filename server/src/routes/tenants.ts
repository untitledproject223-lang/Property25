import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'

export const tenantsRouter = Router()
tenantsRouter.use(requireAuth)

tenantsRouter.get('/', async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT
        t.id, t.org_id, t.apartment_id, t.name, t.email, t.phone, t.whatsapp,
        t.lease_start, t.lease_end, t.status, t.balance,
        t.docs_json, t.move_in_inspection_json,
        t.created_at, t.updated_at,
        a.unit_number
      FROM tenants t
      JOIN apartments a ON a.id = t.apartment_id
      WHERE t.org_id = ${req.orgId!}
      ORDER BY t.name ASC
    `
    res.json({ data: rows })
  } catch (err) {
    next(err)
  }
})

const createTenantSchema = z.object({
  apartmentId: z.string().uuid(),
  name: z.string().min(1).max(160),
  email: z.string().email(),
  phone: z.string().min(5).max(40),
  whatsapp: z.string().max(40).optional(),
  leaseStart: z.string().date(),
  leaseEnd: z.string().date(),
  status: z.enum(['active', 'notice', 'former']).default('active'),
  balance: z.number().default(0),
})

tenantsRouter.post('/', async (req, res, next) => {
  try {
    const body = createTenantSchema.parse(req.body)
    const apartment = await sql`
      SELECT id FROM apartments WHERE id = ${body.apartmentId} AND org_id = ${req.orgId!} LIMIT 1
    `
    if (apartment.length === 0) throw new AppError(400, 'apartmentId not found in this org')

    const rows = await sql`
      INSERT INTO tenants (
        org_id, apartment_id, name, email, phone, whatsapp,
        lease_start, lease_end, status, balance
      )
      VALUES (
        ${req.orgId!}, ${body.apartmentId}, ${body.name}, ${body.email}, ${body.phone},
        ${body.whatsapp ?? null}, ${body.leaseStart}, ${body.leaseEnd}, ${body.status}, ${body.balance}
      )
      RETURNING id, org_id, apartment_id, name, email, phone, whatsapp,
        lease_start, lease_end, status, balance, docs_json, move_in_inspection_json,
        created_at, updated_at
    `
    res.status(201).json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

tenantsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const rows = await sql`
      SELECT id, org_id, apartment_id, name, email, phone, whatsapp,
        lease_start, lease_end, status, balance, docs_json, move_in_inspection_json,
        created_at, updated_at
      FROM tenants
      WHERE id = ${id} AND org_id = ${req.orgId!}
      LIMIT 1
    `
    if (rows.length === 0) throw new AppError(404, 'Tenant not found')
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

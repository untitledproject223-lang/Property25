import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'

export const paymentsRouter = Router()
paymentsRouter.use(requireAuth)

const createSchema = z.object({
  tenantId: z.string().uuid(),
  date: z.string().date(),
  type: z.enum(['rent', 'deposit', 'admin', 'other']),
  amount: z.number().positive(),
  method: z.enum(['eft', 'card', 'cash']),
  status: z.enum(['paid', 'pending', 'failed']).default('paid'),
  proofName: z.string().max(260).optional(),
  note: z.string().max(2000).optional(),
})

paymentsRouter.post('/', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body)
    const tenant = await sql`
      SELECT id, balance::float8 AS balance
      FROM tenants WHERE id = ${body.tenantId} AND org_id = ${req.orgId!} LIMIT 1
    `
    if (tenant.length === 0) throw new AppError(400, 'tenantId not found in this org')

    const rows = await sql`
      INSERT INTO payments (
        org_id, tenant_id, paid_at, type, amount, method, status, proof_name, note
      )
      VALUES (
        ${req.orgId!}, ${body.tenantId}, ${body.date}, ${body.type}, ${body.amount},
        ${body.method}, ${body.status}, ${body.proofName ?? null}, ${body.note ?? null}
      )
      RETURNING id, tenant_id AS "tenantId", paid_at AS date, type,
        amount::float8 AS amount, method, status, proof_name AS "proofName", note
    `

    if (body.status === 'paid') {
      const nextBalance = Math.max(0, Number(tenant[0].balance) - body.amount)
      await sql`
        UPDATE tenants
        SET balance = ${nextBalance}, updated_at = now()
        WHERE id = ${body.tenantId} AND org_id = ${req.orgId!}
      `
    }

    res.status(201).json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

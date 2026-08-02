import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'

export const invoicesRouter = Router()
invoicesRouter.use(requireAuth)

const itemSchema = z.object({
  type: z.enum(['rent', 'deposit', 'admin', 'maintenance', 'other']),
  description: z.string().min(1).max(200),
  amount: z.number(),
})

const createSchema = z.object({
  tenantId: z.string().uuid(),
  dueDate: z.string().date(),
  items: z.array(itemSchema).min(1),
  status: z.enum(['draft', 'sent', 'paid', 'overdue']).default('draft'),
  notes: z.string().max(2000).optional(),
  issuedAt: z.string().date().optional(),
  billingKind: z.enum(['recurring', 'one_time']).default('one_time'),
  isRecurring: z.boolean().optional(),
})

invoicesRouter.post('/', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body)
    const tenant = await sql`
      SELECT id FROM tenants WHERE id = ${body.tenantId} AND org_id = ${req.orgId!} LIMIT 1
    `
    if (tenant.length === 0) throw new AppError(400, 'tenantId not found in this org')

    const total = body.items.reduce((sum, item) => sum + item.amount, 0)
    const issuedAt = body.issuedAt ?? new Date().toISOString().slice(0, 10)
    const billingKind =
      body.billingKind ?? (body.isRecurring ? 'recurring' : 'one_time')
    const isRecurring = body.isRecurring ?? billingKind === 'recurring'

    const rows = await sql`
      INSERT INTO invoices (
        org_id, tenant_id, issued_at, due_date, items_json, total, status, notes,
        is_recurring, billing_kind
      )
      VALUES (
        ${req.orgId!}, ${body.tenantId}, ${issuedAt}, ${body.dueDate},
        ${JSON.stringify(body.items)}::jsonb, ${total}, ${body.status}, ${body.notes ?? null},
        ${isRecurring}, ${billingKind}
      )
      RETURNING id, tenant_id AS "tenantId", issued_at AS "issuedAt", due_date AS "dueDate",
        items_json AS items, total::float8 AS total, status, notes,
        is_recurring AS "isRecurring", billing_kind AS "billingKind"
    `
    res.status(201).json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

invoicesRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const body = z
      .object({
        status: z.enum(['draft', 'sent', 'paid', 'overdue']).optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(req.body)

    const rows = await sql`
      UPDATE invoices
      SET
        status = COALESCE(${body.status ?? null}, status),
        notes = COALESCE(${body.notes ?? null}, notes),
        updated_at = now()
      WHERE id = ${id} AND org_id = ${req.orgId!}
      RETURNING id, tenant_id AS "tenantId", issued_at AS "issuedAt", due_date AS "dueDate",
        items_json AS items, total::float8 AS total, status, notes,
        is_recurring AS "isRecurring", billing_kind AS "billingKind"
    `
    if (rows.length === 0) throw new AppError(404, 'Invoice not found')
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'

export const issuesRouter = Router()
issuesRouter.use(requireAuth)

const createSchema = z.object({
  tenantId: z.string().uuid(),
  subject: z.string().min(1).max(200),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  audience: z.enum(['agent', 'landlord', 'both']).default('agent'),
  message: z.string().min(1).max(4000).optional(),
})

issuesRouter.post('/', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body)
    const tenant = await sql`
      SELECT id FROM tenants WHERE id = ${body.tenantId} AND org_id = ${req.orgId!} LIMIT 1
    `
    if (tenant.length === 0) throw new AppError(400, 'tenantId not found in this org')

    const messages = body.message
      ? [
          {
            id: crypto.randomUUID(),
            author: 'agent',
            body: body.message,
            at: new Date().toISOString(),
          },
        ]
      : []

    const rows = await sql`
      INSERT INTO issues (
        org_id, tenant_id, subject, status, severity, audience, messages_json
      )
      VALUES (
        ${req.orgId!}, ${body.tenantId}, ${body.subject}, 'open',
        ${body.severity}, ${body.audience}, ${JSON.stringify(messages)}::jsonb
      )
      RETURNING id, tenant_id AS "tenantId", subject, status, severity, audience,
        created_at AS "createdAt", messages_json AS messages
    `
    res.status(201).json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

issuesRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const body = z
      .object({
        status: z.enum(['open', 'pending', 'resolved']).optional(),
        reply: z
          .object({
            author: z.enum(['tenant', 'agent', 'landlord']).default('agent'),
            body: z.string().min(1).max(4000),
          })
          .optional(),
      })
      .parse(req.body)

    const existing = await sql`
      SELECT id, messages_json AS messages, status
      FROM issues WHERE id = ${id} AND org_id = ${req.orgId!} LIMIT 1
    `
    if (existing.length === 0) throw new AppError(404, 'Issue not found')

    let messages = Array.isArray(existing[0].messages) ? [...existing[0].messages] : []
    let status = body.status ?? existing[0].status

    if (body.reply) {
      messages.push({
        id: crypto.randomUUID(),
        author: body.reply.author,
        body: body.reply.body,
        at: new Date().toISOString(),
      })
      if (status !== 'resolved') status = 'pending'
    }

    const rows = await sql`
      UPDATE issues
      SET
        status = ${status},
        messages_json = ${JSON.stringify(messages)}::jsonb,
        updated_at = now()
      WHERE id = ${id} AND org_id = ${req.orgId!}
      RETURNING id, tenant_id AS "tenantId", subject, status, severity, audience,
        created_at AS "createdAt", messages_json AS messages
    `
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

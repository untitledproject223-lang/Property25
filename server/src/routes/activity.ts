import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'

export const activityRouter = Router()
activityRouter.use(requireAuth)

const createSchema = z.object({
  tenantId: z.string().uuid().optional().nullable(),
  landlordId: z.string().uuid().optional().nullable(),
  kind: z.enum(['contact', 'landlord_update', 'note']),
  channel: z.enum(['email', 'whatsapp', 'phone', 'note']),
  body: z.string().min(1).max(4000),
})

activityRouter.post('/', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body)

    const rows = await sql`
      INSERT INTO activity_log (org_id, tenant_id, landlord_id, kind, channel, body)
      VALUES (
        ${req.orgId!}, ${body.tenantId ?? null}, ${body.landlordId ?? null},
        ${body.kind}, ${body.channel}, ${body.body}
      )
      RETURNING id, tenant_id AS "tenantId", landlord_id AS "landlordId",
        kind, channel, body, at
    `

    if (body.kind === 'landlord_update') {
      if (!body.landlordId) throw new AppError(400, 'landlordId required for landlord_update')
      await sql`
        INSERT INTO landlord_updates (org_id, landlord_id, tenant_id, body, channel)
        VALUES (
          ${req.orgId!}, ${body.landlordId}, ${body.tenantId ?? null},
          ${body.body}, ${body.channel}
        )
      `
    }

    res.status(201).json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

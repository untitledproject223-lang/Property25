import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'

export const landlordsRouter = Router()
landlordsRouter.use(requireAuth)

landlordsRouter.get('/', async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT id, org_id, name, email, phone, whatsapp, created_at, updated_at
      FROM landlords
      WHERE org_id = ${req.orgId!}
      ORDER BY name ASC
    `
    res.json({ data: rows })
  } catch (err) {
    next(err)
  }
})

const createLandlordSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email(),
  phone: z.string().min(5).max(40),
  whatsapp: z.string().max(40).optional(),
})

landlordsRouter.post('/', async (req, res, next) => {
  try {
    const body = createLandlordSchema.parse(req.body)
    const rows = await sql`
      INSERT INTO landlords (org_id, name, email, phone, whatsapp)
      VALUES (${req.orgId!}, ${body.name}, ${body.email}, ${body.phone}, ${body.whatsapp ?? null})
      RETURNING id, org_id, name, email, phone, whatsapp, created_at, updated_at
    `
    res.status(201).json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

landlordsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const rows = await sql`
      SELECT id, org_id, name, email, phone, whatsapp, created_at, updated_at
      FROM landlords
      WHERE id = ${id} AND org_id = ${req.orgId!}
      LIMIT 1
    `
    if (rows.length === 0) throw new AppError(404, 'Landlord not found')
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

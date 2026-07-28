import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'

export const buildingsRouter = Router()
buildingsRouter.use(requireAuth)

buildingsRouter.get('/', async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT id, org_id, name, address, created_at, updated_at
      FROM buildings
      WHERE org_id = ${req.orgId!}
      ORDER BY name ASC
    `
    res.json({ data: rows })
  } catch (err) {
    next(err)
  }
})

const createBuildingSchema = z.object({
  name: z.string().min(1).max(160),
  address: z.string().min(1).max(300),
})

buildingsRouter.post('/', async (req, res, next) => {
  try {
    const body = createBuildingSchema.parse(req.body)
    const rows = await sql`
      INSERT INTO buildings (org_id, name, address)
      VALUES (${req.orgId!}, ${body.name}, ${body.address})
      RETURNING id, org_id, name, address, created_at, updated_at
    `
    res.status(201).json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

buildingsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const rows = await sql`
      SELECT id, org_id, name, address, created_at, updated_at
      FROM buildings
      WHERE id = ${id} AND org_id = ${req.orgId!}
      LIMIT 1
    `
    if (rows.length === 0) throw new AppError(404, 'Building not found')
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

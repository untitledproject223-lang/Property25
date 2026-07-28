import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'

export const apartmentsRouter = Router()
apartmentsRouter.use(requireAuth)

apartmentsRouter.get('/', async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT
        a.id, a.org_id, a.building_id, a.landlord_id,
        a.unit_number, a.rent, a.deposit, a.status, a.next_due_date,
        a.created_at, a.updated_at,
        b.name AS building_name
      FROM apartments a
      JOIN buildings b ON b.id = a.building_id
      WHERE a.org_id = ${req.orgId!}
      ORDER BY b.name ASC, a.unit_number ASC
    `
    res.json({ data: rows })
  } catch (err) {
    next(err)
  }
})

const createApartmentSchema = z.object({
  buildingId: z.string().uuid(),
  landlordId: z.string().uuid(),
  unitNumber: z.string().min(1).max(40),
  rent: z.number().positive(),
  deposit: z.number().nonnegative(),
  status: z.enum(['vacant', 'occupied', 'notice']).default('vacant'),
  nextDueDate: z.string().date().optional().nullable(),
})

apartmentsRouter.post('/', async (req, res, next) => {
  try {
    const body = createApartmentSchema.parse(req.body)

    const building = await sql`
      SELECT id FROM buildings WHERE id = ${body.buildingId} AND org_id = ${req.orgId!} LIMIT 1
    `
    if (building.length === 0) throw new AppError(400, 'buildingId not found in this org')

    const landlord = await sql`
      SELECT id FROM landlords WHERE id = ${body.landlordId} AND org_id = ${req.orgId!} LIMIT 1
    `
    if (landlord.length === 0) throw new AppError(400, 'landlordId not found in this org')

    const rows = await sql`
      INSERT INTO apartments (
        org_id, building_id, landlord_id, unit_number, rent, deposit, status, next_due_date
      )
      VALUES (
        ${req.orgId!}, ${body.buildingId}, ${body.landlordId}, ${body.unitNumber},
        ${body.rent}, ${body.deposit}, ${body.status}, ${body.nextDueDate ?? null}
      )
      RETURNING id, org_id, building_id, landlord_id, unit_number, rent, deposit, status, next_due_date, created_at, updated_at
    `
    res.status(201).json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

apartmentsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const rows = await sql`
      SELECT id, org_id, building_id, landlord_id, unit_number, rent, deposit, status, next_due_date, created_at, updated_at
      FROM apartments
      WHERE id = ${id} AND org_id = ${req.orgId!}
      LIMIT 1
    `
    if (rows.length === 0) throw new AppError(404, 'Apartment not found')
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

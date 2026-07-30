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

const updateApartmentSchema = z.object({
  buildingId: z.string().uuid().optional(),
  landlordId: z.string().uuid().optional(),
  unitNumber: z.string().min(1).max(40).optional(),
  rent: z.number().positive().optional(),
  deposit: z.number().nonnegative().optional(),
  status: z.enum(['vacant', 'occupied', 'notice']).optional(),
  nextDueDate: z.string().date().nullable().optional(),
})

apartmentsRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const body = updateApartmentSchema.parse(req.body)

    const existing = await sql`
      SELECT * FROM apartments WHERE id = ${id} AND org_id = ${req.orgId!} LIMIT 1
    `
    if (existing.length === 0) throw new AppError(404, 'Apartment not found')

    const buildingId = body.buildingId ?? existing[0].building_id
    const landlordId = body.landlordId ?? existing[0].landlord_id

    const rows = await sql`
      UPDATE apartments
      SET
        building_id = ${buildingId},
        landlord_id = ${landlordId},
        unit_number = ${body.unitNumber ?? existing[0].unit_number},
        rent = ${body.rent ?? existing[0].rent},
        deposit = ${body.deposit ?? existing[0].deposit},
        status = ${body.status ?? existing[0].status},
        next_due_date = ${
          body.nextDueDate !== undefined ? body.nextDueDate : existing[0].next_due_date
        },
        updated_at = now()
      WHERE id = ${id} AND org_id = ${req.orgId!}
      RETURNING id, building_id AS "buildingId", landlord_id AS "landlordId",
        unit_number AS "unitNumber", rent::float8 AS rent, deposit::float8 AS deposit,
        status, next_due_date AS "nextDueDate"
    `
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

apartmentsRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const linked = await sql`
      SELECT id FROM tenants WHERE apartment_id = ${id} AND org_id = ${req.orgId!} LIMIT 1
    `
    if (linked.length > 0) {
      throw new AppError(400, 'Only vacant (unassigned) units can be deleted.')
    }
    const rows = await sql`
      DELETE FROM apartments WHERE id = ${id} AND org_id = ${req.orgId!}
      RETURNING id
    `
    if (rows.length === 0) throw new AppError(404, 'Apartment not found')
    res.json({ data: { id: rows[0].id } })
  } catch (err) {
    next(err)
  }
})

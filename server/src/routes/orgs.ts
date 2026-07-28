import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { AppError } from '../middleware/error.js'

export const orgsRouter = Router()

orgsRouter.get('/', async (req, res, next) => {
  try {
    const orgId = req.orgId!
    const rows = await sql`
      SELECT id, name, slug, branding_json, created_at, updated_at
      FROM organisations
      WHERE id = ${orgId}
      LIMIT 1
    `
    res.json({ data: rows })
  } catch (err) {
    next(err)
  }
})

orgsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    if (id !== req.orgId) throw new AppError(403, 'Forbidden')
    const rows = await sql`
      SELECT id, name, slug, branding_json, created_at, updated_at
      FROM organisations
      WHERE id = ${id}
      LIMIT 1
    `
    if (rows.length === 0) throw new AppError(404, 'Organisation not found')
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

const createOrgSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, numbers, hyphens'),
})

orgsRouter.post('/', async (req, res, next) => {
  try {
    if (req.auth?.role !== 'admin') throw new AppError(403, 'Admin only')
    const body = createOrgSchema.parse(req.body)
    const rows = await sql`
      INSERT INTO organisations (name, slug)
      VALUES (${body.name}, ${body.slug})
      RETURNING id, name, slug, branding_json, created_at, updated_at
    `
    await sql`
      INSERT INTO billing_accounts (org_id, plan_tier, credit_balance)
      VALUES (${rows[0].id}, 'starter', 0)
    `
    res.status(201).json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

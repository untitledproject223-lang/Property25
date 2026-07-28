import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'

export const applicationsRouter = Router()
applicationsRouter.use(requireAuth)

applicationsRouter.get('/', async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT id, org_id, apartment_id, assigned_agent_id, status,
        applicant_name, applicant_email, applicant_phone, completeness_pct,
        created_at, updated_at
      FROM applications
      WHERE org_id = ${req.orgId!}
      ORDER BY updated_at DESC
    `
    res.json({ data: rows })
  } catch (err) {
    next(err)
  }
})

const createApplicationSchema = z.object({
  apartmentId: z.string().uuid().optional().nullable(),
  applicantName: z.string().min(1).max(160),
  applicantEmail: z.string().email(),
  applicantPhone: z.string().min(5).max(40).optional(),
  status: z
    .enum([
      'invited',
      'in_progress',
      'submitted',
      'under_review',
      'awaiting_signature',
      'signed',
      'approved',
      'rejected',
      'tenant',
    ])
    .default('invited'),
})

applicationsRouter.post('/', async (req, res, next) => {
  try {
    const body = createApplicationSchema.parse(req.body)

    if (body.apartmentId) {
      const apt = await sql`
        SELECT id FROM apartments WHERE id = ${body.apartmentId} AND org_id = ${req.orgId!} LIMIT 1
      `
      if (apt.length === 0) throw new AppError(400, 'apartmentId not found in this org')
    }

    const rows = await sql`
      INSERT INTO applications (
        org_id, apartment_id, status, applicant_name, applicant_email, applicant_phone
      )
      VALUES (
        ${req.orgId!}, ${body.apartmentId ?? null}, ${body.status},
        ${body.applicantName}, ${body.applicantEmail}, ${body.applicantPhone ?? null}
      )
      RETURNING id, org_id, apartment_id, assigned_agent_id, status,
        applicant_name, applicant_email, applicant_phone, completeness_pct,
        created_at, updated_at
    `

    await sql`
      INSERT INTO audit_events (org_id, action, entity_type, entity_id, meta_json)
      VALUES (
        ${req.orgId!},
        'application.created',
        'application',
        ${rows[0].id},
        ${JSON.stringify({ email: body.applicantEmail })}::jsonb
      )
    `

    res.status(201).json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

applicationsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const rows = await sql`
      SELECT id, org_id, apartment_id, assigned_agent_id, status,
        applicant_name, applicant_email, applicant_phone, completeness_pct,
        created_at, updated_at
      FROM applications
      WHERE id = ${id} AND org_id = ${req.orgId!}
      LIMIT 1
    `
    if (rows.length === 0) throw new AppError(404, 'Application not found')
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

const patchStatusSchema = z.object({
  status: z.enum([
    'invited',
    'in_progress',
    'submitted',
    'under_review',
    'awaiting_signature',
    'signed',
    'approved',
    'rejected',
    'tenant',
  ]),
  completenessPct: z.number().int().min(0).max(100).optional(),
})

applicationsRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const body = patchStatusSchema.parse(req.body)

    const rows = await sql`
      UPDATE applications
      SET
        status = ${body.status},
        completeness_pct = COALESCE(${body.completenessPct ?? null}, completeness_pct),
        updated_at = now()
      WHERE id = ${id} AND org_id = ${req.orgId!}
      RETURNING id, org_id, apartment_id, assigned_agent_id, status,
        applicant_name, applicant_email, applicant_phone, completeness_pct,
        created_at, updated_at
    `
    if (rows.length === 0) throw new AppError(404, 'Application not found')

    await sql`
      INSERT INTO audit_events (org_id, action, entity_type, entity_id, meta_json)
      VALUES (
        ${req.orgId!},
        'application.status_updated',
        'application',
        ${id},
        ${JSON.stringify({ status: body.status })}::jsonb
      )
    `

    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

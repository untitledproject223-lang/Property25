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

const screeningSchema = z.object({
  enquiryType: z.string().min(1).max(80).default('kyc_credit'),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).default('completed'),
  providerRef: z.string().max(120).optional().nullable(),
  summary: z.record(z.unknown()).default({}),
  affordability: z
    .object({
      band: z.enum(['green', 'amber', 'red']),
      score: z.number().optional().nullable(),
      reasons: z.array(z.unknown()).optional(),
      overrideNote: z.string().optional().nullable(),
    })
    .optional(),
  income: z
    .object({
      grossSalary: z.number().optional().nullable(),
      targetRent: z.number().optional().nullable(),
      majorExpenses: z.array(z.unknown()).optional(),
    })
    .optional(),
  linkTenantId: z.string().uuid().optional().nullable(),
})

applicationsRouter.post('/:id/screening', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const body = screeningSchema.parse(req.body)

    const apps = await sql`
      SELECT id FROM applications WHERE id = ${id} AND org_id = ${req.orgId!} LIMIT 1
    `
    if (apps.length === 0) throw new AppError(404, 'Application not found')

    const screening = await sql`
      INSERT INTO screening_requests (
        org_id, application_id, enquiry_type, status, provider_ref, summary_json
      )
      VALUES (
        ${req.orgId!}, ${id}, ${body.enquiryType}, ${body.status},
        ${body.providerRef ?? null}, ${JSON.stringify(body.summary)}::jsonb
      )
      RETURNING id, application_id AS "applicationId", enquiry_type AS "enquiryType",
        status, provider_ref AS "providerRef", summary_json AS summary,
        created_at AS "createdAt"
    `

    let affordability = null
    if (body.affordability) {
      const rows = await sql`
        INSERT INTO affordability_results (
          org_id, application_id, band, score, reasons_json, override_note
        )
        VALUES (
          ${req.orgId!}, ${id}, ${body.affordability.band},
          ${body.affordability.score ?? null},
          ${JSON.stringify(body.affordability.reasons ?? [])}::jsonb,
          ${body.affordability.overrideNote ?? null}
        )
        ON CONFLICT (application_id) DO UPDATE SET
          band = EXCLUDED.band,
          score = EXCLUDED.score,
          reasons_json = EXCLUDED.reasons_json,
          override_note = EXCLUDED.override_note,
          updated_at = now()
        RETURNING id, application_id AS "applicationId", band, score::float8 AS score,
          reasons_json AS reasons
      `
      affordability = rows[0]
    }

    if (body.income) {
      await sql`
        INSERT INTO application_income (
          org_id, application_id, gross_salary, target_rent, major_expenses_json
        )
        VALUES (
          ${req.orgId!}, ${id},
          ${body.income.grossSalary ?? null},
          ${body.income.targetRent ?? null},
          ${JSON.stringify(body.income.majorExpenses ?? [])}::jsonb
        )
        ON CONFLICT (application_id) DO UPDATE SET
          gross_salary = EXCLUDED.gross_salary,
          target_rent = EXCLUDED.target_rent,
          major_expenses_json = EXCLUDED.major_expenses_json,
          updated_at = now()
      `
    }

    if (body.linkTenantId) {
      await sql`
        UPDATE documents
        SET tenant_id = ${body.linkTenantId}
        WHERE org_id = ${req.orgId!}
          AND application_id = ${id}
          AND tenant_id IS NULL
      `
    }

    res.status(201).json({
      data: { screening: screening[0], affordability },
    })
  } catch (err) {
    next(err)
  }
})

import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { requireAuth, requireAgent } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'
import { canAccessApplication } from '../lib/applicationAccess.js'
import { generateInviteToken } from '../lib/inviteToken.js'
import { inviteLink } from '../lib/publicUrl.js'

export const applicationsRouter = Router()
applicationsRouter.use(requireAuth)

function isDoneFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

/** Signature / shared-step keys that must never be wiped by another party's save. */
const SIGN_DONE_KEYS = [
  'signApplicantDone',
  'signLandlordDone',
  'signAgentDone',
  'inspectionTenantSigned',
  'inspectionLandlordSigned',
  'inspectionAgentSigned',
  'leaseNextTenant',
  'leaseNextLandlord',
  'leaseNextAgent',
  'moveinNextTenant',
  'moveinNextLandlord',
  'moveinNextAgent',
] as const

const SIGN_TEXT_KEYS = [
  'signApplicantName',
  'signApplicantDate',
  'signApplicantMark',
  'signLandlordName',
  'signLandlordDate',
  'signLandlordMark',
  'signAgentName',
  'signAgentDate',
  'signAgentMark',
] as const

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

/** Merge application form payloads so concurrent party saves keep every signature. */
function mergeApplicationForm(
  existingRaw: unknown,
  incomingRaw: unknown,
): Record<string, unknown> {
  const existing = asRecord(existingRaw)
  const incoming = asRecord(incomingRaw)
  const merged: Record<string, unknown> = { ...existing, ...incoming }

  for (const key of SIGN_DONE_KEYS) {
    merged[key] = isDoneFlag(existing[key]) || isDoneFlag(incoming[key])
  }

  for (const key of SIGN_TEXT_KEYS) {
    const next = incoming[key]
    const prev = existing[key]
    if (typeof next === 'string' && next.trim()) {
      merged[key] = next
    } else if (typeof prev === 'string' && prev.trim()) {
      merged[key] = prev
    }
  }

  return merged
}

function mergeCompletedStages(existingRaw: unknown, incomingRaw: unknown): string[] {
  return Array.from(new Set([...asStringArray(existingRaw), ...asStringArray(incomingRaw)]))
}

function withSharedStageCompletion(
  form: Record<string, unknown>,
  stages: string[],
): string[] {
  const next = new Set(stages)
  // Lease unlocks after tenant + landlord click Next (agent is not required).
  if (isDoneFlag(form.leaseNextTenant) && isDoneFlag(form.leaseNextLandlord)) {
    next.add('lease')
  }
  // Move-in unlocks when the agent clicks Next.
  if (isDoneFlag(form.moveinNextAgent)) {
    next.add('movein')
    next.add('success')
  }
  return Array.from(next)
}

applicationsRouter.get('/', async (req, res, next) => {
  try {
    const auth = req.auth!
    let rows

    if (auth.role === 'admin' || auth.role === 'agent') {
      rows = await sql`
        SELECT a.id, a.org_id, a.apartment_id, a.assigned_agent_id, a.status,
          a.applicant_name, a.applicant_email, a.applicant_phone, a.completeness_pct,
          a.applicant_user_id, a.created_at, a.updated_at,
          apt.unit_number AS unit_number, b.name AS building_name
        FROM applications a
        LEFT JOIN apartments apt ON apt.id = a.apartment_id
        LEFT JOIN buildings b ON b.id = apt.building_id
        WHERE a.org_id = ${req.orgId!}
        ORDER BY a.updated_at DESC
      `
    } else if (auth.role === 'tenant') {
      rows = await sql`
        SELECT a.id, a.org_id, a.apartment_id, a.assigned_agent_id, a.status,
          a.applicant_name, a.applicant_email, a.applicant_phone, a.completeness_pct,
          a.applicant_user_id, a.created_at, a.updated_at,
          apt.unit_number AS unit_number, b.name AS building_name
        FROM applications a
        LEFT JOIN apartments apt ON apt.id = a.apartment_id
        LEFT JOIN buildings b ON b.id = apt.building_id
        WHERE a.org_id = ${req.orgId!}
          AND (
            a.applicant_user_id = ${auth.sub}
            OR lower(a.applicant_email) = lower(${auth.email})
          )
        ORDER BY a.updated_at DESC
      `
    } else {
      // All applications on this landlord's units (including in-progress)
      const profileId = auth.profileId ?? null
      rows = profileId
        ? await sql`
            SELECT a.id, a.org_id, a.apartment_id, a.assigned_agent_id, a.status,
              a.applicant_name, a.applicant_email, a.applicant_phone, a.completeness_pct,
              a.applicant_user_id, a.created_at, a.updated_at,
              apt.unit_number AS unit_number, b.name AS building_name
            FROM applications a
            JOIN apartments apt ON apt.id = a.apartment_id
            LEFT JOIN buildings b ON b.id = apt.building_id
            JOIN landlords l ON l.id = apt.landlord_id
            WHERE a.org_id = ${req.orgId!}
              AND (l.user_id = ${auth.sub} OR l.id = ${profileId})
            ORDER BY a.updated_at DESC
          `
        : await sql`
            SELECT a.id, a.org_id, a.apartment_id, a.assigned_agent_id, a.status,
              a.applicant_name, a.applicant_email, a.applicant_phone, a.completeness_pct,
              a.applicant_user_id, a.created_at, a.updated_at,
              apt.unit_number AS unit_number, b.name AS building_name
            FROM applications a
            JOIN apartments apt ON apt.id = a.apartment_id
            LEFT JOIN buildings b ON b.id = apt.building_id
            JOIN landlords l ON l.id = apt.landlord_id
            WHERE a.org_id = ${req.orgId!}
              AND l.user_id = ${auth.sub}
            ORDER BY a.updated_at DESC
          `
    }

    res.json({ data: rows })
  } catch (err) {
    next(err)
  }
})

applicationsRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const auth = req.auth!

    if (!(await canAccessApplication(auth, id))) {
      throw new AppError(404, 'Application not found')
    }

    const existing = await sql`
      SELECT id, status FROM applications
      WHERE id = ${id} AND org_id = ${req.orgId!}
      LIMIT 1
    `
    if (existing.length === 0) throw new AppError(404, 'Application not found')

    const status = String(existing[0].status)
    if (status === 'tenant') {
      throw new AppError(400, 'Completed tenancy applications cannot be deleted')
    }

    // Agents and landlords may delete in-progress applications they can access.
    // Deleting the row removes it for every party (agent, landlord, and tenant lists).
    if (auth.role !== 'admin' && auth.role !== 'agent' && auth.role !== 'landlord') {
      throw new AppError(403, 'You cannot delete this application')
    }

    await sql`DELETE FROM invites WHERE application_id = ${id}`
    await sql`DELETE FROM documents WHERE application_id = ${id} AND org_id = ${req.orgId!}`
    await sql`DELETE FROM screening_requests WHERE application_id = ${id} AND org_id = ${req.orgId!}`
    await sql`DELETE FROM affordability_results WHERE application_id = ${id} AND org_id = ${req.orgId!}`
    await sql`DELETE FROM application_income WHERE application_id = ${id} AND org_id = ${req.orgId!}`
    await sql`DELETE FROM application_payloads WHERE application_id = ${id}`
    await sql`
      DELETE FROM applications WHERE id = ${id} AND org_id = ${req.orgId!}
    `

    await sql`
      INSERT INTO audit_events (org_id, action, entity_type, entity_id, meta_json, actor_user_id)
      VALUES (
        ${req.orgId!},
        'application.deleted',
        'application',
        ${id},
        ${JSON.stringify({ status, by: auth.role, removedFor: ['agent', 'landlord', 'tenant'] })}::jsonb,
        ${auth.sub}
      )
    `

    res.json({ data: { id, deleted: true } })
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
  inviteApplicant: z.boolean().optional().default(true),
  formData: z.record(z.unknown()).optional(),
})

applicationsRouter.post('/', requireAgent, async (req, res, next) => {
  try {
    const body = createApplicationSchema.parse(req.body)

    if (!body.apartmentId) {
      throw new AppError(400, 'Select a unit before creating the application')
    }

    const apt = await sql`
      SELECT id FROM apartments WHERE id = ${body.apartmentId} AND org_id = ${req.orgId!} LIMIT 1
    `
    if (apt.length === 0) throw new AppError(400, 'apartmentId not found in this org')

    const rows = await sql`
      INSERT INTO applications (
        org_id, apartment_id, status, applicant_name, applicant_email, applicant_phone,
        assigned_agent_id
      )
      VALUES (
        ${req.orgId!}, ${body.apartmentId ?? null}, ${body.status},
        ${body.applicantName}, ${body.applicantEmail}, ${body.applicantPhone ?? null},
        ${req.auth!.sub}
      )
      RETURNING id, org_id, apartment_id, assigned_agent_id, status,
        applicant_name, applicant_email, applicant_phone, completeness_pct,
        applicant_user_id, created_at, updated_at
    `

    const appId = String(rows[0].id)
    const formJson = body.formData ?? {}

    await sql`
      INSERT INTO application_payloads (application_id, org_id, form_json, completed_stages)
      VALUES (${appId}, ${req.orgId!}, ${JSON.stringify(formJson)}::jsonb, '[]'::jsonb)
    `

    await sql`
      INSERT INTO audit_events (org_id, action, entity_type, entity_id, meta_json)
      VALUES (
        ${req.orgId!},
        'application.created',
        'application',
        ${appId},
        ${JSON.stringify({ email: body.applicantEmail })}::jsonb
      )
    `

    let invite: { inviteUrl: string; email: string } | null = null
    if (body.inviteApplicant) {
      const { token, tokenHash } = generateInviteToken()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      await sql`
        INSERT INTO invites (
          org_id, email, role, token_hash, expires_at, application_id, invited_by
        )
        VALUES (
          ${req.orgId!}, ${body.applicantEmail.trim().toLowerCase()}, 'tenant',
          ${tokenHash}, ${expiresAt.toISOString()}, ${appId}, ${req.auth!.sub}
        )
      `
      const url = inviteLink(token)
      console.log(`[invite] tenant ${body.applicantEmail} → ${url}`)
      invite = { inviteUrl: url, email: body.applicantEmail }
    }

    res.status(201).json({ data: { ...rows[0], invite } })
  } catch (err) {
    next(err)
  }
})

applicationsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    if (!(await canAccessApplication(req.auth!, id))) {
      throw new AppError(404, 'Application not found')
    }

    const rows = await sql`
      SELECT id, org_id, apartment_id, assigned_agent_id, status,
        applicant_name, applicant_email, applicant_phone, completeness_pct,
        applicant_user_id, created_at, updated_at
      FROM applications
      WHERE id = ${id} AND org_id = ${req.orgId!}
      LIMIT 1
    `
    if (rows.length === 0) throw new AppError(404, 'Application not found')

    const payload = await sql`
      SELECT form_json AS "formData", completed_stages AS "completedStages",
        updated_at AS "payloadUpdatedAt"
      FROM application_payloads
      WHERE application_id = ${id}
      LIMIT 1
    `

    res.json({
      data: {
        ...rows[0],
        formData: payload[0]?.formData ?? {},
        completedStages: payload[0]?.completedStages ?? [],
        payloadUpdatedAt: payload[0]?.payloadUpdatedAt ?? null,
      },
    })
  } catch (err) {
    next(err)
  }
})

const patchSchema = z.object({
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
    .optional(),
  completenessPct: z.number().int().min(0).max(100).optional(),
  formData: z.record(z.unknown()).optional(),
  completedStages: z.array(z.string()).optional(),
  apartmentId: z.string().uuid().optional().nullable(),
  applicantName: z.string().min(1).max(160).optional(),
  applicantEmail: z.string().email().optional(),
  applicantPhone: z.string().max(40).optional().nullable(),
})

applicationsRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    if (!(await canAccessApplication(req.auth!, id))) {
      throw new AppError(404, 'Application not found')
    }

    const body = patchSchema.parse(req.body)
    const auth = req.auth!

    // Only agents may change apartment / core applicant identity fields.
    // Tenants/landlords may still save form progress; ignore identity fields from them.
    if (auth.role !== 'admin' && auth.role !== 'agent') {
      if (
        body.apartmentId !== undefined ||
        body.applicantName !== undefined ||
        body.applicantEmail !== undefined
      ) {
        // Soft-ignore identity updates from non-agents instead of hard-failing progress saves.
        delete (body as { apartmentId?: unknown }).apartmentId
        delete (body as { applicantName?: unknown }).applicantName
        delete (body as { applicantEmail?: unknown }).applicantEmail
      }
    }

    const formApartmentId =
      body.formData && typeof body.formData === 'object' && !Array.isArray(body.formData)
        ? (body.formData as Record<string, unknown>).apartmentId
        : undefined
    const resolvedApartmentId =
      auth.role === 'admin' || auth.role === 'agent'
        ? body.apartmentId !== undefined && body.apartmentId !== null
          ? body.apartmentId
          : typeof formApartmentId === 'string' && formApartmentId.length > 0
            ? formApartmentId
            : null
        : null

    if (resolvedApartmentId) {
      const apt = await sql`
        SELECT id FROM apartments
        WHERE id = ${resolvedApartmentId} AND org_id = ${req.orgId!}
        LIMIT 1
      `
      if (apt.length === 0) throw new AppError(400, 'apartmentId not found in this org')
    }

    const rows = await sql`
      UPDATE applications
      SET
        status = COALESCE(${body.status ?? null}, status),
        completeness_pct = COALESCE(${body.completenessPct ?? null}, completeness_pct),
        apartment_id = COALESCE(${resolvedApartmentId}, apartment_id),
        applicant_name = COALESCE(${
          auth.role === 'admin' || auth.role === 'agent'
            ? (body.applicantName ?? null)
            : null
        }, applicant_name),
        applicant_email = COALESCE(${
          auth.role === 'admin' || auth.role === 'agent'
            ? (body.applicantEmail ?? null)
            : null
        }, applicant_email),
        applicant_phone = COALESCE(${body.applicantPhone ?? null}, applicant_phone),
        updated_at = now()
      WHERE id = ${id} AND org_id = ${req.orgId!}
      RETURNING id, org_id, apartment_id, assigned_agent_id, status,
        applicant_name, applicant_email, applicant_phone, completeness_pct,
        applicant_user_id, created_at, updated_at
    `
    if (rows.length === 0) throw new AppError(404, 'Application not found')

    if (body.formData !== undefined || body.completedStages !== undefined) {
      const existing = await sql`
        SELECT form_json, completed_stages FROM application_payloads
        WHERE application_id = ${id} LIMIT 1
      `
      const existingForm = existing[0]?.form_json ?? {}
      const existingStages = existing[0]?.completed_stages ?? []

      const nextForm =
        body.formData !== undefined
          ? mergeApplicationForm(existingForm, body.formData)
          : asRecord(existingForm)

      const nextStages = withSharedStageCompletion(
        nextForm,
        body.completedStages !== undefined
          ? mergeCompletedStages(existingStages, body.completedStages)
          : asStringArray(existingStages),
      )

      if (existing.length === 0) {
        await sql`
          INSERT INTO application_payloads (application_id, org_id, form_json, completed_stages)
          VALUES (
            ${id}, ${req.orgId!},
            ${JSON.stringify(nextForm)}::jsonb,
            ${JSON.stringify(nextStages)}::jsonb
          )
        `
      } else {
        await sql`
          UPDATE application_payloads
          SET
            form_json = ${JSON.stringify(nextForm)}::jsonb,
            completed_stages = ${JSON.stringify(nextStages)}::jsonb,
            updated_at = now()
          WHERE application_id = ${id}
        `
      }
    }

    const payload = await sql`
      SELECT form_json AS "formData", completed_stages AS "completedStages",
        updated_at AS "payloadUpdatedAt"
      FROM application_payloads
      WHERE application_id = ${id}
      LIMIT 1
    `

    res.json({
      data: {
        ...rows[0],
        formData: payload[0]?.formData ?? {},
        completedStages: payload[0]?.completedStages ?? [],
        payloadUpdatedAt: payload[0]?.payloadUpdatedAt ?? null,
      },
    })
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

applicationsRouter.post('/:id/screening', requireAgent, async (req, res, next) => {
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
      // Link applicant user to tenant record if present
      await sql`
        UPDATE tenants t
        SET user_id = a.applicant_user_id, updated_at = now()
        FROM applications a
        WHERE t.id = ${body.linkTenantId}
          AND a.id = ${id}
          AND a.applicant_user_id IS NOT NULL
          AND t.user_id IS NULL
      `
    }

    res.status(201).json({
      data: { screening: screening[0], affordability },
    })
  } catch (err) {
    next(err)
  }
})

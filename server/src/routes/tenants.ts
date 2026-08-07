import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import {
  assertCanDownloadTenantLease,
  ensureTenantLeaseDocument,
} from '../lib/ensureTenantLeaseDocument.js'
import { requireAuth, requireAgent } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'

export const tenantsRouter = Router()
tenantsRouter.use(requireAuth)

tenantsRouter.get('/', async (req, res, next) => {
  try {
    // Only tenants onboarded through the application process
    const rows = await sql`
      SELECT
        t.id, t.org_id, t.apartment_id, t.name, t.email, t.phone, t.whatsapp,
        t.lease_start, t.lease_end, t.status, t.balance,
        t.docs_json, t.move_in_inspection_json, t.application_id,
        t.created_at, t.updated_at,
        a.unit_number
      FROM tenants t
      JOIN apartments a ON a.id = t.apartment_id
      WHERE t.org_id = ${req.orgId!}
        AND t.application_id IS NOT NULL
      ORDER BY t.name ASC
    `
    res.json({ data: rows })
  } catch (err) {
    next(err)
  }
})

const createTenantSchema = z.object({
  apartmentId: z.string().uuid(),
  applicationId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(160),
  email: z.string().email(),
  phone: z.string().min(5).max(40),
  whatsapp: z.string().max(40).optional(),
  leaseStart: z.string().date(),
  leaseEnd: z.string().date(),
  status: z.enum(['active', 'notice', 'former']).default('active'),
  balance: z.number().default(0),
  moveInInspection: z
    .object({
      date: z.string(),
      agent: z.string(),
      summary: z.string(),
      meterElectric: z.string().optional(),
      meterWater: z.string().optional(),
    })
    .optional(),
  docs: z.record(z.string()).optional(),
})

tenantsRouter.post('/', async (req, res, next) => {
  try {
    const body = createTenantSchema.parse(req.body)
    const apartment = await sql`
      SELECT id, deleted_at
      FROM apartments
      WHERE id = ${body.apartmentId} AND org_id = ${req.orgId!}
      LIMIT 1
    `
    if (apartment.length === 0) throw new AppError(400, 'apartmentId not found in this org')
    if (apartment[0].deleted_at) {
      throw new AppError(400, 'This unit has been deleted and cannot receive new tenants')
    }

    let applicationId = body.applicationId ?? null
    let applicantUserId: string | null = null
    if (applicationId) {
      const app = await sql`
        SELECT id, applicant_user_id
        FROM applications
        WHERE id = ${applicationId} AND org_id = ${req.orgId!}
        LIMIT 1
      `
      if (app.length === 0) throw new AppError(400, 'applicationId not found in this org')
      applicantUserId = app[0].applicant_user_id
        ? String(app[0].applicant_user_id)
        : null

      // Idempotent: never create a second tenant row for the same application.
      const existingForApp = await sql`
        SELECT id, org_id, apartment_id, application_id, user_id, name, email, phone, whatsapp,
          lease_start, lease_end, status, balance, docs_json, move_in_inspection_json,
          created_at, updated_at
        FROM tenants
        WHERE application_id = ${applicationId} AND org_id = ${req.orgId!}
        ORDER BY
          CASE WHEN status IN ('active', 'notice') THEN 0 ELSE 1 END,
          updated_at DESC NULLS LAST
        LIMIT 1
      `
      if (existingForApp.length > 0) {
        res.status(200).json({ data: existingForApp[0] })
        return
      }
    }

    // One current lease per unit — do not stack active tenants.
    const activeOnUnit = await sql`
      SELECT id, org_id, apartment_id, application_id, user_id, name, email, phone, whatsapp,
        lease_start, lease_end, status, balance, docs_json, move_in_inspection_json,
        created_at, updated_at
      FROM tenants
      WHERE apartment_id = ${body.apartmentId}
        AND org_id = ${req.orgId!}
        AND status IN ('active', 'notice')
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    `
    if (activeOnUnit.length > 0) {
      res.status(200).json({ data: activeOnUnit[0] })
      return
    }

    const rows = await sql`
      INSERT INTO tenants (
        org_id, apartment_id, application_id, user_id, name, email, phone, whatsapp,
        lease_start, lease_end, status, balance, docs_json, move_in_inspection_json
      )
      VALUES (
        ${req.orgId!}, ${body.apartmentId}, ${applicationId}, ${applicantUserId},
        ${body.name}, ${body.email}, ${body.phone},
        ${body.whatsapp ?? null}, ${body.leaseStart}, ${body.leaseEnd}, ${body.status}, ${body.balance},
        ${JSON.stringify(body.docs ?? {})}::jsonb,
        ${body.moveInInspection ? JSON.stringify(body.moveInInspection) : null}::jsonb
      )
      RETURNING id, org_id, apartment_id, application_id, user_id, name, email, phone, whatsapp,
        lease_start, lease_end, status, balance, docs_json, move_in_inspection_json,
        created_at, updated_at
    `

    await sql`
      UPDATE apartments
      SET status = 'occupied', updated_at = now()
      WHERE id = ${body.apartmentId} AND org_id = ${req.orgId!}
    `

    if (applicationId) {
      await sql`
        UPDATE applications
        SET status = 'tenant', updated_at = now()
        WHERE id = ${applicationId} AND org_id = ${req.orgId!}
      `
      // Best-effort: materialize signed lease for later download by all parties.
      try {
        await ensureTenantLeaseDocument({
          orgId: req.orgId!,
          tenantId: String(rows[0].id),
          applicationId,
        })
      } catch {
        // Lease may still be downloadable later once form_json has content.
      }
    }

    res.status(201).json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

/** Download the signed lease for a tenant (agent, landlord, or that tenant). */
tenantsRouter.get('/:id/lease', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const auth = req.auth!
    const tenant = await assertCanDownloadTenantLease({
      orgId: req.orgId!,
      userId: auth.sub,
      email: auth.email,
      role: auth.role,
      profileId: auth.profileId ?? null,
      tenantId: id,
    })

    const doc = await ensureTenantLeaseDocument({
      orgId: req.orgId!,
      tenantId: id,
      applicationId: tenant.application_id ? String(tenant.application_id) : null,
    })
    res.json({ data: doc })
  } catch (err) {
    next(err)
  }
})

tenantsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const rows = await sql`
      SELECT id, org_id, apartment_id, name, email, phone, whatsapp,
        lease_start, lease_end, status, balance, docs_json, move_in_inspection_json,
        created_at, updated_at
      FROM tenants
      WHERE id = ${id} AND org_id = ${req.orgId!}
      LIMIT 1
    `
    if (rows.length === 0) throw new AppError(404, 'Tenant not found')
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

const updateTenantSchema = z.object({
  status: z.enum(['active', 'notice', 'former']).optional(),
  balance: z.number().optional(),
  docs: z.record(z.string()).optional(),
  moveInInspection: z
    .object({
      date: z.string(),
      agent: z.string(),
      summary: z.string(),
      meterElectric: z.string().optional(),
      meterWater: z.string().optional(),
    })
    .optional()
    .nullable(),
})

tenantsRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const body = updateTenantSchema.parse(req.body)

    const existing = await sql`
      SELECT * FROM tenants WHERE id = ${id} AND org_id = ${req.orgId!} LIMIT 1
    `
    if (existing.length === 0) throw new AppError(404, 'Tenant not found')

    const docsJson =
      body.docs !== undefined ? JSON.stringify(body.docs) : JSON.stringify(existing[0].docs_json)
    const moveIn =
      body.moveInInspection !== undefined
        ? body.moveInInspection
          ? JSON.stringify(body.moveInInspection)
          : null
        : existing[0].move_in_inspection_json
          ? JSON.stringify(existing[0].move_in_inspection_json)
          : null

    const rows = await sql`
      UPDATE tenants
      SET
        status = ${body.status ?? existing[0].status},
        balance = ${body.balance ?? existing[0].balance},
        docs_json = ${docsJson}::jsonb,
        move_in_inspection_json = ${moveIn}::jsonb,
        updated_at = now()
      WHERE id = ${id} AND org_id = ${req.orgId!}
      RETURNING id, apartment_id AS "apartmentId", name, email, phone, whatsapp,
        lease_start AS "leaseStart", lease_end AS "leaseEnd", status,
        balance::float8 AS balance, docs_json AS docs,
        move_in_inspection_json AS "moveInInspection"
    `
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

const terminateSchema = z.object({
  reason: z.string().min(1).max(2000),
  depositPaidOut: z.boolean(),
  terminationDate: z.string().date(),
})

/** Agent/admin: terminate a lease and free the unit immediately. */
tenantsRouter.post('/:id/terminate', requireAgent, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const body = terminateSchema.parse(req.body)

    const existing = await sql`
      SELECT id, apartment_id, status
      FROM tenants
      WHERE id = ${id} AND org_id = ${req.orgId!}
      LIMIT 1
    `
    if (existing.length === 0) throw new AppError(404, 'Tenant not found')
    if (String(existing[0].status) === 'former') {
      throw new AppError(400, 'This lease is already terminated')
    }

    const apartmentId = String(existing[0].apartment_id)

    // Close this lease and any duplicate active leases still on the same unit.
    const rows = await sql`
      UPDATE tenants
      SET
        status = 'former',
        lease_end = ${body.terminationDate},
        termination_reason = CASE
          WHEN id = ${id} THEN ${body.reason.trim()}
          ELSE COALESCE(termination_reason, ${body.reason.trim()})
        END,
        deposit_paid_out = CASE
          WHEN id = ${id} THEN ${body.depositPaidOut}
          ELSE deposit_paid_out
        END,
        terminated_at = ${body.terminationDate},
        updated_at = now()
      WHERE org_id = ${req.orgId!}
        AND apartment_id = ${apartmentId}
        AND (id = ${id} OR status IN ('active', 'notice'))
      RETURNING id, apartment_id AS "apartmentId", name, email, phone, status,
        lease_start AS "leaseStart", lease_end AS "leaseEnd",
        termination_reason AS "terminationReason",
        deposit_paid_out AS "depositPaidOut",
        terminated_at AS "terminatedAt"
    `

    await sql`
      UPDATE apartments
      SET
        status = 'vacant',
        deposit_balance = CASE
          WHEN ${body.depositPaidOut} THEN 0
          ELSE deposit_balance
        END,
        updated_at = now()
      WHERE id = ${apartmentId} AND org_id = ${req.orgId!}
    `

    const closedTenantIds = rows.map((r) => String(r.id))
    if (closedTenantIds.length > 0) {
      await sql`
        UPDATE issues
        SET
          status = 'resolved',
          updated_at = now(),
          messages_json = COALESCE(messages_json, '[]'::jsonb) || ${JSON.stringify([
            {
              id: crypto.randomUUID(),
              author: 'agent',
              body: 'Ticket closed automatically because the lease was terminated.',
              at: new Date().toISOString(),
            },
          ])}::jsonb
        WHERE org_id = ${req.orgId!}
          AND tenant_id = ANY(${closedTenantIds}::uuid[])
          AND status IN ('open', 'pending')
      `
    }

    const primary = rows.find((r) => String(r.id) === id) ?? rows[0]
    res.json({ data: primary })
  } catch (err) {
    next(err)
  }
})

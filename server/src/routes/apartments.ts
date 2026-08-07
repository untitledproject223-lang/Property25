import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { softDeleteApartment } from '../lib/softDeleteApartment.js'
import { leaseConfigSchema } from '../leaseConfig.js'
import { requireAuth, requireAgent } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'

export const apartmentsRouter = Router()
apartmentsRouter.use(requireAuth)

apartmentsRouter.get('/', async (req, res, next) => {
  try {
    const scope = String(req.query.scope ?? 'current')
    const previous = scope === 'previous'
    const rows = previous
      ? await sql`
          SELECT
            a.id, a.org_id, a.building_id, a.landlord_id,
            a.unit_number, a.rent, a.deposit, a.status, a.next_due_date,
            a.lease_config AS "leaseConfig",
            a.deleted_at AS "deletedAt",
            a.created_at, a.updated_at,
            b.name AS building_name,
            b.address AS building_address,
            l.name AS landlord_name
          FROM apartments a
          JOIN buildings b ON b.id = a.building_id
          JOIN landlords l ON l.id = a.landlord_id
          WHERE a.org_id = ${req.orgId!}
            AND a.deleted_at IS NOT NULL
          ORDER BY a.deleted_at DESC NULLS LAST, b.name ASC, a.unit_number ASC
        `
      : await sql`
          SELECT
            a.id, a.org_id, a.building_id, a.landlord_id,
            a.unit_number, a.rent, a.deposit, a.status, a.next_due_date,
            a.lease_config AS "leaseConfig",
            a.deleted_at AS "deletedAt",
            a.created_at, a.updated_at,
            b.name AS building_name
          FROM apartments a
          JOIN buildings b ON b.id = a.building_id
          WHERE a.org_id = ${req.orgId!}
            AND a.deleted_at IS NULL
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
  postalCode: z.string().max(32).optional().nullable(),
  levies: z.number().nonnegative().optional().nullable(),
  municipal: z.number().nonnegative().optional().nullable(),
  purchasePrice: z.number().nonnegative().optional().nullable(),
  bankOwed: z.number().nonnegative().optional().nullable(),
  leaseConfig: leaseConfigSchema.optional().nullable(),
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

    const leaseConfigJson = body.leaseConfig ? JSON.stringify(body.leaseConfig) : null

    const rows = await sql`
      INSERT INTO apartments (
        org_id, building_id, landlord_id, unit_number, rent, deposit, deposit_balance, status,
        next_due_date, postal_code, levies, municipal, purchase_price, bank_owed, lease_config
      )
      VALUES (
        ${req.orgId!}, ${body.buildingId}, ${body.landlordId}, ${body.unitNumber},
        ${body.rent}, ${body.deposit}, ${body.deposit}, ${body.status}, ${body.nextDueDate ?? null},
        ${body.postalCode ?? null}, ${body.levies ?? null}, ${body.municipal ?? null},
        ${body.purchasePrice ?? null}, ${body.bankOwed ?? null},
        ${leaseConfigJson}::jsonb
      )
      RETURNING id, org_id, building_id, landlord_id, unit_number, rent, deposit, deposit_balance,
        status, next_due_date, postal_code, levies, municipal, purchase_price, bank_owed,
        lease_config AS "leaseConfig",
        created_at, updated_at
    `
    res.status(201).json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

apartmentsRouter.get('/:id/history', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const apartments = await sql`
      SELECT
        a.id, a.building_id AS "buildingId", a.landlord_id AS "landlordId",
        a.unit_number AS "unitNumber", a.rent::float8 AS rent, a.deposit::float8 AS deposit,
        a.status, a.next_due_date AS "nextDueDate",
        b.name AS "buildingName", b.address AS "buildingAddress",
        l.name AS "landlordName", l.email AS "landlordEmail",
        l.phone AS "landlordPhone", l.whatsapp AS "landlordWhatsapp"
      FROM apartments a
      JOIN buildings b ON b.id = a.building_id
      JOIN landlords l ON l.id = a.landlord_id
      WHERE a.id = ${id} AND a.org_id = ${req.orgId!}
      LIMIT 1
    `
    if (apartments.length === 0) throw new AppError(404, 'Apartment not found')

    const tenants = await sql`
      SELECT
        id, apartment_id AS "apartmentId", name, email, phone, whatsapp,
        lease_start AS "leaseStart", lease_end AS "leaseEnd", status,
        balance::float8 AS balance, docs_json AS docs,
        move_in_inspection_json AS "moveInInspection",
        created_at AS "createdAt"
      FROM tenants
      WHERE apartment_id = ${id} AND org_id = ${req.orgId!}
      ORDER BY lease_start DESC NULLS LAST, created_at DESC
    `

    const applications = await sql`
      SELECT
        id, apartment_id AS "apartmentId", status,
        applicant_name AS "applicantName",
        applicant_email AS "applicantEmail",
        applicant_phone AS "applicantPhone",
        completeness_pct AS "completenessPct",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM applications
      WHERE org_id = ${req.orgId!}
        AND (
          apartment_id = ${id}
          OR lower(applicant_email) IN (
            SELECT lower(email) FROM tenants WHERE apartment_id = ${id} AND org_id = ${req.orgId!}
          )
        )
      ORDER BY created_at DESC
    `

    const invoices = await sql`
      SELECT
        i.id, i.tenant_id AS "tenantId", i.issued_at AS "issuedAt",
        i.due_date AS "dueDate", i.items_json AS items, i.total::float8 AS total,
        i.status, i.notes,
        i.is_recurring AS "isRecurring", i.billing_kind AS "billingKind",
        i.issue_id AS "issueId"
      FROM invoices i
      JOIN tenants t ON t.id = i.tenant_id
      WHERE i.org_id = ${req.orgId!} AND t.apartment_id = ${id}
      ORDER BY i.issued_at DESC
    `

    const payments = await sql`
      SELECT
        p.id, p.tenant_id AS "tenantId", p.paid_at AS date, p.type,
        p.amount::float8 AS amount, p.method, p.status,
        p.proof_name AS "proofName", p.note
      FROM payments p
      JOIN tenants t ON t.id = p.tenant_id
      WHERE p.org_id = ${req.orgId!} AND t.apartment_id = ${id}
      ORDER BY p.paid_at DESC
    `

    const issues = await sql`
      SELECT
        i.id, i.tenant_id AS "tenantId", i.subject, i.status, i.severity, i.audience,
        i.messages_json AS messages, i.created_at AS "createdAt"
      FROM issues i
      JOIN tenants t ON t.id = i.tenant_id
      WHERE i.org_id = ${req.orgId!} AND t.apartment_id = ${id}
      ORDER BY i.created_at DESC
    `

    const documents = await sql`
      SELECT
        d.id, d.application_id AS "applicationId", d.tenant_id AS "tenantId",
        d.doc_type AS "docType", d.filename, d.mime_type AS "mimeType",
        d.size_bytes AS "sizeBytes", d.created_at AS "createdAt"
      FROM documents d
      LEFT JOIN tenants t ON t.id = d.tenant_id
      LEFT JOIN applications a ON a.id = d.application_id
      WHERE d.org_id = ${req.orgId!}
        AND (
          t.apartment_id = ${id}
          OR a.apartment_id = ${id}
          OR lower(a.applicant_email) IN (
            SELECT lower(email) FROM tenants WHERE apartment_id = ${id} AND org_id = ${req.orgId!}
          )
        )
      ORDER BY d.created_at DESC
    `

    const screening = await sql`
      SELECT
        s.id, s.application_id AS "applicationId", s.enquiry_type AS "enquiryType",
        s.status, s.provider_ref AS "providerRef", s.summary_json AS summary,
        s.created_at AS "createdAt", s.updated_at AS "updatedAt"
      FROM screening_requests s
      JOIN applications a ON a.id = s.application_id
      WHERE s.org_id = ${req.orgId!}
        AND (
          a.apartment_id = ${id}
          OR lower(a.applicant_email) IN (
            SELECT lower(email) FROM tenants WHERE apartment_id = ${id} AND org_id = ${req.orgId!}
          )
        )
      ORDER BY s.created_at DESC
    `

    const affordability = await sql`
      SELECT
        r.id, r.application_id AS "applicationId", r.band, r.score::float8 AS score,
        r.rule_version AS "ruleVersion", r.reasons_json AS reasons,
        r.override_note AS "overrideNote", r.created_at AS "createdAt"
      FROM affordability_results r
      JOIN applications a ON a.id = r.application_id
      WHERE r.org_id = ${req.orgId!}
        AND (
          a.apartment_id = ${id}
          OR lower(a.applicant_email) IN (
            SELECT lower(email) FROM tenants WHERE apartment_id = ${id} AND org_id = ${req.orgId!}
          )
        )
      ORDER BY r.created_at DESC
    `

    const income = await sql`
      SELECT
        i.id, i.application_id AS "applicationId",
        i.gross_salary::float8 AS "grossSalary",
        i.target_rent::float8 AS "targetRent",
        i.major_expenses_json AS "majorExpenses"
      FROM application_income i
      JOIN applications a ON a.id = i.application_id
      WHERE i.org_id = ${req.orgId!}
        AND (
          a.apartment_id = ${id}
          OR lower(a.applicant_email) IN (
            SELECT lower(email) FROM tenants WHERE apartment_id = ${id} AND org_id = ${req.orgId!}
          )
        )
    `

    res.json({
      data: {
        apartment: apartments[0],
        tenants,
        applications,
        invoices,
        payments,
        issues,
        documents,
        screening,
        affordability,
        income,
      },
    })
  } catch (err) {
    next(err)
  }
})

apartmentsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const rows = await sql`
      SELECT id, org_id, building_id, landlord_id, unit_number, rent, deposit, status, next_due_date,
        lease_config AS "leaseConfig",
        created_at, updated_at
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
  leaseConfig: leaseConfigSchema.optional().nullable(),
})

apartmentsRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const body = updateApartmentSchema.parse(req.body)

    const existing = await sql`
      SELECT * FROM apartments WHERE id = ${id} AND org_id = ${req.orgId!} LIMIT 1
    `
    if (existing.length === 0) throw new AppError(404, 'Apartment not found')
    if (existing[0].deleted_at) {
      throw new AppError(400, 'This unit has been deleted and cannot be edited')
    }

    const buildingId = body.buildingId ?? existing[0].building_id
    const landlordId = body.landlordId ?? existing[0].landlord_id
    const nextDeposit = body.deposit ?? existing[0].deposit
    const oldDeposit = Number(existing[0].deposit)
    const oldBalance = Number(
      existing[0].deposit_balance ?? existing[0].deposit ?? 0,
    )
    // If deposit held never had deductions, keep balance aligned with deposit
    const nextBalance =
      body.deposit !== undefined && oldBalance === oldDeposit
        ? Number(nextDeposit)
        : oldBalance

    const leaseConfigJson =
      body.leaseConfig !== undefined
        ? body.leaseConfig
          ? JSON.stringify(body.leaseConfig)
          : null
        : existing[0].lease_config != null
          ? JSON.stringify(existing[0].lease_config)
          : null

    const rows = await sql`
      UPDATE apartments
      SET
        building_id = ${buildingId},
        landlord_id = ${landlordId},
        unit_number = ${body.unitNumber ?? existing[0].unit_number},
        rent = ${body.rent ?? existing[0].rent},
        deposit = ${nextDeposit},
        deposit_balance = ${nextBalance},
        status = ${body.status ?? existing[0].status},
        next_due_date = ${
          body.nextDueDate !== undefined ? body.nextDueDate : existing[0].next_due_date
        },
        lease_config = ${leaseConfigJson}::jsonb,
        updated_at = now()
      WHERE id = ${id} AND org_id = ${req.orgId!}
      RETURNING id, building_id AS "buildingId", landlord_id AS "landlordId",
        unit_number AS "unitNumber", rent::float8 AS rent, deposit::float8 AS deposit,
        deposit_balance::float8 AS "depositBalance",
        status, next_due_date AS "nextDueDate",
        lease_config AS "leaseConfig"
    `
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

apartmentsRouter.delete('/:id', requireAgent, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const deleted = await softDeleteApartment({
      apartmentId: id,
      orgId: req.orgId!,
      actor: 'agent',
    })
    res.json({ data: deleted })
  } catch (err) {
    next(err)
  }
})

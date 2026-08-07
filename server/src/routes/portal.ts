import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { leaseConfigSchema } from '../leaseConfig.js'
import { softDeleteApartment } from '../lib/softDeleteApartment.js'
import { generateInviteToken, hashInviteToken } from '../lib/inviteToken.js'
import { unitAgentInviteLink } from '../lib/publicUrl.js'
import { requireAuth, requireTenant, requireLandlord, requireAgent } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'

export const portalRouter = Router()
portalRouter.use(requireAuth)

/** Tenant: list stays (tenancy records linked to this user). */
portalRouter.get('/tenant/stays', requireTenant, async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT
        t.id,
        t.apartment_id AS "apartmentId",
        t.name,
        t.email,
        t.phone,
        t.lease_start AS "leaseStart",
        t.lease_end AS "leaseEnd",
        t.status,
        t.balance::float8 AS balance,
        t.docs_json AS docs,
        a.unit_number AS "unitNumber",
        a.rent::float8 AS rent,
        a.deposit::float8 AS deposit,
        COALESCE(a.deposit_balance, a.deposit)::float8 AS "depositBalance",
        a.ticket_manager AS "ticketManager",
        b.name AS "buildingName",
        b.address AS "buildingAddress",
        l.id AS "landlordId",
        l.name AS "landlordName",
        l.email AS "landlordEmail",
        l.phone AS "landlordPhone"
      FROM tenants t
      JOIN apartments a ON a.id = t.apartment_id
      JOIN buildings b ON b.id = a.building_id
      JOIN landlords l ON l.id = a.landlord_id
      WHERE t.user_id = ${req.auth!.sub}
        AND t.org_id = ${req.orgId!}
      ORDER BY
        CASE t.status WHEN 'active' THEN 0 WHEN 'notice' THEN 1 ELSE 2 END,
        t.lease_start DESC
    `
    res.json({ data: rows })
  } catch (err) {
    next(err)
  }
})

/** Tenant: stay detail with invoices, payments, docs, screening. */
portalRouter.get('/tenant/stays/:id', requireTenant, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const stays = await sql`
      SELECT
        t.id,
        t.apartment_id AS "apartmentId",
        t.name,
        t.email,
        t.phone,
        t.lease_start AS "leaseStart",
        t.lease_end AS "leaseEnd",
        t.status,
        t.balance::float8 AS balance,
        t.docs_json AS docs,
        t.move_in_inspection_json AS "moveInInspection",
        a.unit_number AS "unitNumber",
        a.rent::float8 AS rent,
        a.deposit::float8 AS deposit,
        COALESCE(a.deposit_balance, a.deposit)::float8 AS "depositBalance",
        a.ticket_manager AS "ticketManager",
        b.name AS "buildingName",
        b.address AS "buildingAddress",
        l.id AS "landlordId",
        l.name AS "landlordName",
        l.email AS "landlordEmail",
        l.phone AS "landlordPhone"
      FROM tenants t
      JOIN apartments a ON a.id = t.apartment_id
      JOIN buildings b ON b.id = a.building_id
      JOIN landlords l ON l.id = a.landlord_id
      WHERE t.id = ${id}
        AND t.user_id = ${req.auth!.sub}
        AND t.org_id = ${req.orgId!}
      LIMIT 1
    `
    if (stays.length === 0) throw new AppError(404, 'Stay not found')

    const [invoices, payments, documents, issues, screening] = await Promise.all([
      sql`
        SELECT id, issued_at AS "issuedAt", due_date AS "dueDate",
          items_json AS items, total::float8 AS total, status, notes,
          billing_kind AS "billingKind", is_recurring AS "isRecurring",
          issue_id AS "issueId"
        FROM invoices WHERE tenant_id = ${id} AND org_id = ${req.orgId!}
        ORDER BY issued_at DESC
      `,
      sql`
        SELECT id, paid_at AS date, type, amount::float8 AS amount, method, status,
          proof_name AS "proofName", note
        FROM payments WHERE tenant_id = ${id} AND org_id = ${req.orgId!}
        ORDER BY paid_at DESC
      `,
      sql`
        SELECT
          d.id,
          d.doc_type AS "docType",
          d.filename AS "fileName",
          d.filename,
          d.mime_type AS "mimeType",
          d.created_at AS "createdAt"
        FROM documents d
        WHERE d.org_id = ${req.orgId!}
          AND (
            d.tenant_id = ${id}
            OR (
              d.tenant_id IS NULL
              AND d.application_id = (SELECT application_id FROM tenants WHERE id = ${id})
            )
          )
        ORDER BY d.created_at DESC
      `,
      sql`
        SELECT id, subject, status, severity, audience, issue_type AS "issueType",
          management_owner AS "managementOwner", decision_json AS decision,
          created_at AS "createdAt", messages_json AS messages
        FROM issues WHERE tenant_id = ${id} AND org_id = ${req.orgId!}
        ORDER BY created_at DESC
      `,
      sql`
        SELECT sr.summary_json AS summary, sr.status, sr.enquiry_type AS "enquiryType",
          ar.band, ar.score::float8 AS score
        FROM applications a
        LEFT JOIN screening_requests sr ON sr.application_id = a.id
        LEFT JOIN affordability_results ar ON ar.application_id = a.id
        WHERE a.org_id = ${req.orgId!}
          AND (
            a.applicant_user_id = ${req.auth!.sub}
            OR lower(a.applicant_email) = lower(${req.auth!.email})
          )
        ORDER BY sr.created_at DESC NULLS LAST
        LIMIT 1
      `,
    ])

    res.json({
      data: {
        stay: stays[0],
        invoices,
        payments,
        documents,
        issues,
        screening: screening[0] ?? null,
      },
    })
  } catch (err) {
    next(err)
  }
})

/** Tenant profile */
portalRouter.get('/tenant/profile', requireTenant, async (req, res, next) => {
  try {
    const user = await sql`
      SELECT id, email, full_name AS name, avatar_base64 AS "avatarBase64",
        avatar_mime AS "avatarMime"
      FROM users WHERE id = ${req.auth!.sub} LIMIT 1
    `
    const tenant = await sql`
      SELECT id, phone, whatsapp, name, application_id AS "applicationId"
      FROM tenants
      WHERE user_id = ${req.auth!.sub} AND org_id = ${req.orgId!}
      ORDER BY updated_at DESC
      LIMIT 1
    `
    res.json({
      data: {
        ...user[0],
        phone: tenant[0]?.phone ?? null,
        whatsapp: tenant[0]?.whatsapp ?? null,
        displayName: tenant[0]?.name ?? user[0]?.name,
        tenantId: tenant[0]?.id ?? null,
        applicationId: tenant[0]?.applicationId ?? null,
      },
    })
  } catch (err) {
    next(err)
  }
})

/** Tenant: update personal details (not email) */
portalRouter.patch('/tenant/profile', requireTenant, async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1).max(160).optional(),
        phone: z.string().min(5).max(40).optional(),
        whatsapp: z.string().max(40).optional().nullable(),
      })
      .parse(req.body)

    if (body.name) {
      await sql`
        UPDATE users SET full_name = ${body.name.trim()}
        WHERE id = ${req.auth!.sub}
      `
    }

    const tenant = await sql`
      SELECT id FROM tenants
      WHERE user_id = ${req.auth!.sub} AND org_id = ${req.orgId!}
      ORDER BY updated_at DESC LIMIT 1
    `
    if (tenant.length > 0) {
      await sql`
        UPDATE tenants SET
          name = COALESCE(${body.name?.trim() ?? null}, name),
          phone = COALESCE(${body.phone ?? null}, phone),
          whatsapp = COALESCE(${body.whatsapp ?? null}, whatsapp),
          updated_at = now()
        WHERE id = ${tenant[0].id}
      `
    }

    const updated = await sql`
      SELECT u.id, u.email, u.full_name AS name, u.avatar_base64 AS "avatarBase64",
        u.avatar_mime AS "avatarMime",
        t.id AS "tenantId", t.phone, t.whatsapp, t.name AS "displayName",
        t.application_id AS "applicationId"
      FROM users u
      LEFT JOIN tenants t ON t.user_id = u.id AND t.org_id = ${req.orgId!}
      WHERE u.id = ${req.auth!.sub}
      ORDER BY t.updated_at DESC NULLS LAST
      LIMIT 1
    `
    res.json({ data: updated[0] })
  } catch (err) {
    next(err)
  }
})

/** Tenant: upload / replace profile picture */
portalRouter.post('/tenant/profile/avatar', requireTenant, async (req, res, next) => {
  try {
    const body = z
      .object({
        contentBase64: z.string().min(1),
        mimeType: z.string().min(3).max(80),
      })
      .parse(req.body)
    if (!body.mimeType.startsWith('image/')) {
      throw new AppError(400, 'Avatar must be an image')
    }
    await sql`
      UPDATE users
      SET avatar_base64 = ${body.contentBase64}, avatar_mime = ${body.mimeType}
      WHERE id = ${req.auth!.sub}
    `
    res.json({ data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

/** Tenant: all invoices across stays */
portalRouter.get('/tenant/invoices', requireTenant, async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT
        i.id,
        i.issued_at AS "issuedAt",
        i.due_date AS "dueDate",
        i.items_json AS items,
        i.total::float8 AS total,
        i.status,
        i.notes,
        i.billing_kind AS "billingKind",
        i.is_recurring AS "isRecurring",
        i.issue_id AS "issueId",
        t.id AS "tenantId",
        a.unit_number AS "unitNumber",
        b.name AS "buildingName"
      FROM invoices i
      JOIN tenants t ON t.id = i.tenant_id
      JOIN apartments a ON a.id = t.apartment_id
      JOIN buildings b ON b.id = a.building_id
      WHERE t.user_id = ${req.auth!.sub}
        AND i.org_id = ${req.orgId!}
        AND i.status <> 'draft'
      ORDER BY i.issued_at DESC
    `
    res.json({ data: rows })
  } catch (err) {
    next(err)
  }
})

/** Landlord portfolio summary */
portalRouter.get('/landlord/portfolio', requireLandlord, async (req, res, next) => {
  try {
    const landlord = await sql`
      SELECT id, name, email, phone
      FROM landlords
      WHERE user_id = ${req.auth!.sub} AND org_id = ${req.orgId!}
      LIMIT 1
    `
    if (landlord.length === 0) throw new AppError(404, 'Landlord profile not found')
    const landlordId = String(landlord[0].id)

    const units = await sql`
      SELECT
        a.id,
        a.unit_number AS "unitNumber",
        a.rent::float8 AS rent,
        a.deposit::float8 AS deposit,
        COALESCE(a.deposit_balance, a.deposit)::float8 AS "depositBalance",
        a.status,
        a.ticket_manager AS "ticketManager",
        a.managing_agent_id AS "managingAgentId",
        a.postal_code AS "postalCode",
        a.levies::float8 AS levies,
        a.municipal::float8 AS municipal,
        a.purchase_price::float8 AS "purchasePrice",
        a.bank_owed::float8 AS "bankOwed",
        a.lease_config AS "leaseConfig",
        ma.full_name AS "managingAgentName",
        ma.email AS "managingAgentEmail",
        b.name AS "buildingName",
        b.address AS "buildingAddress",
        t.id AS "tenantId",
        t.name AS "tenantName",
        t.email AS "tenantEmail",
        t.phone AS "tenantPhone",
        t.status AS "tenantStatus",
        t.balance::float8 AS balance,
        t.lease_start AS "leaseStart",
        t.lease_end AS "leaseEnd",
        (
          SELECT count(*)::int FROM issues i
          WHERE i.tenant_id = t.id AND i.status IN ('open', 'pending')
        ) AS "openIssues"
      FROM apartments a
      JOIN buildings b ON b.id = a.building_id
      LEFT JOIN users ma ON ma.id = a.managing_agent_id
      LEFT JOIN LATERAL (
        SELECT
          tn.id,
          tn.name,
          tn.email,
          tn.phone,
          tn.status,
          tn.balance,
          tn.lease_start,
          tn.lease_end
        FROM tenants tn
        WHERE tn.apartment_id = a.id
          AND tn.status IN ('active', 'notice')
          AND tn.application_id IS NOT NULL
        ORDER BY
          CASE WHEN tn.status = 'active' THEN 0 ELSE 1 END,
          tn.updated_at DESC NULLS LAST,
          tn.created_at DESC NULLS LAST
        LIMIT 1
      ) t ON true
      WHERE a.landlord_id = ${landlordId} AND a.org_id = ${req.orgId!}
        AND a.deleted_at IS NULL
      ORDER BY
        CASE WHEN t.id IS NULL THEN 1 ELSE 0 END,
        t.name NULLS LAST,
        b.name,
        a.unit_number
    `

    const previousUnits = await sql`
      SELECT
        a.id,
        a.unit_number AS "unitNumber",
        a.rent::float8 AS rent,
        a.deposit::float8 AS deposit,
        COALESCE(a.deposit_balance, a.deposit)::float8 AS "depositBalance",
        a.status,
        a.deleted_at AS "deletedAt",
        a.postal_code AS "postalCode",
        a.levies::float8 AS levies,
        a.municipal::float8 AS municipal,
        a.purchase_price AS "purchasePrice",
        a.bank_owed AS "bankOwed",
        b.name AS "buildingName",
        b.address AS "buildingAddress"
      FROM apartments a
      JOIN buildings b ON b.id = a.building_id
      WHERE a.landlord_id = ${landlordId}
        AND a.org_id = ${req.orgId!}
        AND a.deleted_at IS NOT NULL
      ORDER BY a.deleted_at DESC NULLS LAST, b.name, a.unit_number
    `

    res.json({
      data: {
        landlord: landlord[0],
        units,
        previousUnits,
      },
    })
  } catch (err) {
    next(err)
  }
})

/** Landlord: set ticket manager for a unit */
portalRouter.patch(
  '/landlord/units/:id/ticket-manager',
  requireLandlord,
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.id)
      const body = z.object({ ticketManager: z.enum(['landlord', 'agent']) }).parse(req.body)

      const rows = await sql`
        UPDATE apartments a
        SET ticket_manager = ${body.ticketManager}, updated_at = now()
        FROM landlords l
        WHERE a.id = ${id}
          AND a.landlord_id = l.id
          AND l.user_id = ${req.auth!.sub}
          AND a.org_id = ${req.orgId!}
        RETURNING a.id, a.ticket_manager AS "ticketManager", a.unit_number AS "unitNumber"
      `
      if (rows.length === 0) throw new AppError(404, 'Unit not found')

      // Sync open undecided tickets so the new manager can approve costs immediately
      await sql`
        UPDATE issues i
        SET
          management_owner = ${body.ticketManager},
          updated_at = now()
        FROM tenants t
        WHERE t.id = i.tenant_id
          AND t.apartment_id = ${id}
          AND i.org_id = ${req.orgId!}
          AND i.status IN ('open', 'pending')
          AND (
            i.decision_json IS NULL
            OR i.decision_json = '{}'::jsonb
            OR NOT (i.decision_json ? 'outcome')
          )
      `

      res.json({ data: rows[0] })
    } catch (err) {
      next(err)
    }
  },
)

/** Landlord: list org buildings (for adding units) */
portalRouter.get('/landlord/buildings', requireLandlord, async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT id, name, address
      FROM buildings
      WHERE org_id = ${req.orgId!}
      ORDER BY name
    `
    res.json({ data: rows })
  } catch (err) {
    next(err)
  }
})

/** Landlord: add a unit under their own landlord profile */
portalRouter.post('/landlord/units', requireLandlord, async (req, res, next) => {
  try {
    const body = z
      .object({
        buildingId: z.string().uuid().optional(),
        newBuildingName: z.string().min(1).max(160).optional(),
        newBuildingAddress: z.string().max(300).optional(),
        unitNumber: z.string().min(1).max(40),
        rent: z.number().positive(),
        deposit: z.number().nonnegative(),
        postalCode: z.string().max(32).optional().nullable(),
        levies: z.number().nonnegative().optional().nullable(),
        municipal: z.number().nonnegative().optional().nullable(),
        purchasePrice: z.number().nonnegative().optional().nullable(),
        bankOwed: z.number().nonnegative().optional().nullable(),
        leaseConfig: leaseConfigSchema.optional().nullable(),
      })
      .parse(req.body)

    const landlord = await sql`
      SELECT id FROM landlords
      WHERE user_id = ${req.auth!.sub} AND org_id = ${req.orgId!}
      LIMIT 1
    `
    if (landlord.length === 0) throw new AppError(404, 'Landlord profile not found')
    const landlordId = String(landlord[0].id)

    let buildingId = body.buildingId
    if (body.newBuildingName?.trim()) {
      const created = await sql`
        INSERT INTO buildings (org_id, name, address)
        VALUES (
          ${req.orgId!},
          ${body.newBuildingName.trim()},
          ${body.newBuildingAddress?.trim() || 'Address TBD'}
        )
        RETURNING id
      `
      buildingId = String(created[0].id)
    }
    if (!buildingId) throw new AppError(400, 'Select or create a building')

    const building = await sql`
      SELECT id FROM buildings WHERE id = ${buildingId} AND org_id = ${req.orgId!} LIMIT 1
    `
    if (building.length === 0) throw new AppError(400, 'Building not found')

    const leaseConfigJson = body.leaseConfig ? JSON.stringify(body.leaseConfig) : null

    const rows = await sql`
      INSERT INTO apartments (
        org_id, building_id, landlord_id, unit_number, rent, deposit, deposit_balance, status,
        postal_code, levies, municipal, purchase_price, bank_owed, lease_config
      )
      VALUES (
        ${req.orgId!}, ${buildingId}, ${landlordId}, ${body.unitNumber.trim()},
        ${body.rent}, ${body.deposit}, ${body.deposit}, 'vacant',
        ${body.postalCode ?? null}, ${body.levies ?? null}, ${body.municipal ?? null},
        ${body.purchasePrice ?? null}, ${body.bankOwed ?? null},
        ${leaseConfigJson}::jsonb
      )
      RETURNING id, unit_number AS "unitNumber", rent::float8 AS rent,
        deposit::float8 AS deposit, status, building_id AS "buildingId",
        landlord_id AS "landlordId", lease_config AS "leaseConfig"
    `

    res.status(201).json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

/** Landlord: soft-delete one of their units */
portalRouter.delete('/landlord/units/:id', requireLandlord, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const owned = await sql`
      SELECT a.id
      FROM apartments a
      JOIN landlords l ON l.id = a.landlord_id
      WHERE a.id = ${id}
        AND a.org_id = ${req.orgId!}
        AND l.user_id = ${req.auth!.sub}
      LIMIT 1
    `
    if (owned.length === 0) throw new AppError(404, 'Unit not found')

    const deleted = await softDeleteApartment({
      apartmentId: id,
      orgId: req.orgId!,
      actor: 'landlord',
    })
    res.json({ data: deleted })
  } catch (err) {
    next(err)
  }
})

/** Landlord: update ownership / finance details for a unit */
portalRouter.patch('/landlord/units/:id/details', requireLandlord, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const body = z
      .object({
        postalCode: z.string().max(32).optional().nullable(),
        levies: z.number().nonnegative().optional().nullable(),
        municipal: z.number().nonnegative().optional().nullable(),
        purchasePrice: z.number().nonnegative().optional().nullable(),
        bankOwed: z.number().nonnegative().optional().nullable(),
        leaseConfig: leaseConfigSchema.optional().nullable(),
      })
      .parse(req.body)

    const existing = await sql`
      SELECT
        a.id,
        a.postal_code,
        a.levies,
        a.municipal,
        a.purchase_price,
        a.bank_owed,
        a.lease_config,
        a.deleted_at
      FROM apartments a
      JOIN landlords l ON l.id = a.landlord_id
      WHERE a.id = ${id}
        AND l.user_id = ${req.auth!.sub}
        AND a.org_id = ${req.orgId!}
      LIMIT 1
    `
    if (existing.length === 0) throw new AppError(404, 'Unit not found')
    if (existing[0].deleted_at) {
      throw new AppError(400, 'This unit has been deleted and cannot be edited')
    }

    const current = existing[0]
    const postalCode =
      body.postalCode !== undefined ? body.postalCode?.trim() || null : current.postal_code
    const levies = body.levies !== undefined ? body.levies : current.levies
    const municipal = body.municipal !== undefined ? body.municipal : current.municipal
    const purchasePrice =
      body.purchasePrice !== undefined ? body.purchasePrice : current.purchase_price
    const bankOwed = body.bankOwed !== undefined ? body.bankOwed : current.bank_owed
    const leaseConfigJson =
      body.leaseConfig !== undefined
        ? body.leaseConfig
          ? JSON.stringify(body.leaseConfig)
          : null
        : current.lease_config != null
          ? JSON.stringify(current.lease_config)
          : null

    const rows = await sql`
      UPDATE apartments
      SET
        postal_code = ${postalCode},
        levies = ${levies},
        municipal = ${municipal},
        purchase_price = ${purchasePrice},
        bank_owed = ${bankOwed},
        lease_config = ${leaseConfigJson}::jsonb,
        updated_at = now()
      WHERE id = ${id} AND org_id = ${req.orgId!}
      RETURNING
        id,
        unit_number AS "unitNumber",
        postal_code AS "postalCode",
        levies::float8 AS levies,
        municipal::float8 AS municipal,
        purchase_price::float8 AS "purchasePrice",
        bank_owed::float8 AS "bankOwed",
        lease_config AS "leaseConfig"
    `

    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

/** Landlord: invoices for tenants on their units */
portalRouter.get('/landlord/invoices', requireLandlord, async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT
        i.id,
        i.issued_at AS "issuedAt",
        i.due_date AS "dueDate",
        i.items_json AS items,
        i.total::float8 AS total,
        i.status,
        i.notes,
        i.billing_kind AS "billingKind",
        i.is_recurring AS "isRecurring",
        i.issue_id AS "issueId",
        t.id AS "tenantId",
        t.name AS "tenantName",
        a.unit_number AS "unitNumber",
        b.name AS "buildingName"
      FROM invoices i
      JOIN tenants t ON t.id = i.tenant_id
      JOIN apartments a ON a.id = t.apartment_id
      JOIN buildings b ON b.id = a.building_id
      JOIN landlords l ON l.id = a.landlord_id
      WHERE l.user_id = ${req.auth!.sub}
        AND i.org_id = ${req.orgId!}
      ORDER BY i.issued_at DESC
    `
    res.json({ data: rows })
  } catch (err) {
    next(err)
  }
})

/** Landlord: active tenants on their units (for invoice create) */
portalRouter.get('/landlord/tenants', requireLandlord, async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT
        t.id,
        t.name,
        t.email,
        t.status,
        a.id AS "apartmentId",
        a.unit_number AS "unitNumber",
        a.rent::float8 AS rent,
        a.deposit::float8 AS deposit,
        b.name AS "buildingName"
      FROM tenants t
      JOIN apartments a ON a.id = t.apartment_id
      JOIN buildings b ON b.id = a.building_id
      JOIN landlords l ON l.id = a.landlord_id
      WHERE l.user_id = ${req.auth!.sub}
        AND t.org_id = ${req.orgId!}
        AND t.status IN ('active', 'notice')
      ORDER BY t.name ASC
    `
    res.json({ data: rows })
  } catch (err) {
    next(err)
  }
})

/** Landlord: previous / terminated tenants (lease history) */
portalRouter.get('/landlord/tenant-history', requireLandlord, async (req, res, next) => {
  try {
    const rows = await sql`
      SELECT
        t.id,
        t.name,
        t.email,
        t.phone,
        t.status,
        t.balance::float8 AS balance,
        t.lease_start AS "leaseStart",
        t.lease_end AS "leaseEnd",
        t.termination_reason AS "terminationReason",
        t.deposit_paid_out AS "depositPaidOut",
        t.terminated_at AS "terminatedAt",
        a.id AS "apartmentId",
        a.unit_number AS "unitNumber",
        a.rent::float8 AS rent,
        a.deposit::float8 AS deposit,
        COALESCE(a.deposit_balance, a.deposit)::float8 AS "depositBalance",
        b.name AS "buildingName",
        b.address AS "buildingAddress"
      FROM tenants t
      JOIN apartments a ON a.id = t.apartment_id
      JOIN buildings b ON b.id = a.building_id
      JOIN landlords l ON l.id = a.landlord_id
      WHERE l.user_id = ${req.auth!.sub}
        AND t.org_id = ${req.orgId!}
        AND t.status = 'former'
        AND t.application_id IS NOT NULL
      ORDER BY
        COALESCE(t.terminated_at, t.lease_end) DESC NULLS LAST,
        t.name ASC
    `
    res.json({ data: rows })
  } catch (err) {
    next(err)
  }
})

const terminateLeaseSchema = z.object({
  reason: z.string().min(1).max(2000),
  depositPaidOut: z.boolean(),
  terminationDate: z.string().date(),
})

/** Landlord: terminate a lease on their unit and free it immediately. */
portalRouter.post(
  '/landlord/tenants/:id/terminate',
  requireLandlord,
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.id)
      const body = terminateLeaseSchema.parse(req.body)

      const existing = await sql`
        SELECT t.id, t.apartment_id, t.status
        FROM tenants t
        JOIN apartments a ON a.id = t.apartment_id
        JOIN landlords l ON l.id = a.landlord_id
        WHERE t.id = ${id}
          AND t.org_id = ${req.orgId!}
          AND l.user_id = ${req.auth!.sub}
        LIMIT 1
      `
      if (existing.length === 0) throw new AppError(404, 'Tenant not found')
      if (String(existing[0].status) === 'former') {
        throw new AppError(400, 'This lease is already terminated')
      }

      const apartmentId = String(existing[0].apartment_id)

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
        RETURNING id, apartment_id AS "apartmentId", name, status,
          lease_end AS "leaseEnd",
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
                author: 'landlord',
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
  },
)

/** Agent helper: invite landlord */
portalRouter.post('/agent/invite-landlord', requireAgent, async (req, res, next) => {
  try {
    const body = z.object({ landlordId: z.string().uuid() }).parse(req.body)
    const l = await sql`
      SELECT id, email FROM landlords
      WHERE id = ${body.landlordId} AND org_id = ${req.orgId!}
      LIMIT 1
    `
    if (l.length === 0) throw new AppError(404, 'Landlord not found')
    res.json({ data: { landlordId: l[0].id, email: l[0].email } })
  } catch (err) {
    next(err)
  }
})

/** Landlord: create a shareable link for an agent to accept admin rights on a unit */
portalRouter.post(
  '/landlord/units/:id/agent-invite',
  requireLandlord,
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.id)
      const owned = await sql`
        SELECT a.id, a.unit_number AS "unitNumber", b.name AS "buildingName"
        FROM apartments a
        JOIN buildings b ON b.id = a.building_id
        JOIN landlords l ON l.id = a.landlord_id
        WHERE a.id = ${id}
          AND l.user_id = ${req.auth!.sub}
          AND a.org_id = ${req.orgId!}
        LIMIT 1
      `
      if (owned.length === 0) throw new AppError(404, 'Unit not found')

      const { token, tokenHash } = generateInviteToken()
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      await sql`
        INSERT INTO unit_agent_invites (
          org_id, apartment_id, token_hash, expires_at, invited_by
        )
        VALUES (
          ${req.orgId!}, ${id}, ${tokenHash}, ${expiresAt.toISOString()}, ${req.auth!.sub}
        )
      `

      const inviteUrl = unitAgentInviteLink(token)
      res.status(201).json({
        data: {
          inviteUrl,
          unitNumber: owned[0].unitNumber,
          buildingName: owned[0].buildingName,
          expiresAt,
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

/** Peek unit agent invite (any authenticated user — typically an agent) */
portalRouter.get('/unit-agent-invites/:token', async (req, res, next) => {
  try {
    const token = z.string().min(16).parse(req.params.token)
    const tokenHash = hashInviteToken(token)
    const rows = await sql`
      SELECT
        i.id,
        i.expires_at AS "expiresAt",
        i.accepted_at AS "acceptedAt",
        a.id AS "apartmentId",
        a.unit_number AS "unitNumber",
        b.name AS "buildingName",
        b.address AS "buildingAddress",
        l.name AS "landlordName",
        o.name AS "orgName"
      FROM unit_agent_invites i
      JOIN apartments a ON a.id = i.apartment_id
      JOIN buildings b ON b.id = a.building_id
      JOIN landlords l ON l.id = a.landlord_id
      JOIN organisations o ON o.id = i.org_id
      WHERE i.token_hash = ${tokenHash}
      LIMIT 1
    `
    if (rows.length === 0) throw new AppError(404, 'Invite not found')
    const invite = rows[0]
    if (invite.acceptedAt) throw new AppError(410, 'Invite already accepted')
    if (new Date(String(invite.expiresAt)) < new Date()) {
      throw new AppError(410, 'Invite has expired')
    }
    res.json({ data: invite })
  } catch (err) {
    next(err)
  }
})

/** Agent accepts unit admin rights */
portalRouter.post('/unit-agent-invites/:token/accept', requireAgent, async (req, res, next) => {
  try {
    const token = z.string().min(16).parse(req.params.token)
    const tokenHash = hashInviteToken(token)
    const rows = await sql`
      SELECT id, org_id, apartment_id, expires_at, accepted_at
      FROM unit_agent_invites
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `
    if (rows.length === 0) throw new AppError(404, 'Invite not found')
    const invite = rows[0]
    if (invite.accepted_at) throw new AppError(410, 'Invite already accepted')
    if (new Date(String(invite.expires_at)) < new Date()) {
      throw new AppError(410, 'Invite has expired')
    }
    if (String(invite.org_id) !== req.orgId!) {
      throw new AppError(403, 'This invite belongs to a different organisation')
    }

    await sql`
      UPDATE apartments
      SET
        managing_agent_id = ${req.auth!.sub},
        ticket_manager = 'agent',
        updated_at = now()
      WHERE id = ${invite.apartment_id} AND org_id = ${req.orgId!}
    `
    await sql`
      UPDATE unit_agent_invites
      SET accepted_at = now(), accepted_by = ${req.auth!.sub}
      WHERE id = ${invite.id}
    `
    await sql`
      UPDATE issues i
      SET management_owner = 'agent', updated_at = now()
      FROM tenants t
      WHERE t.id = i.tenant_id
        AND t.apartment_id = ${invite.apartment_id}
        AND i.org_id = ${req.orgId!}
        AND i.status IN ('open', 'pending')
    `

    res.json({
      data: {
        apartmentId: invite.apartment_id,
        accepted: true,
      },
    })
  } catch (err) {
    next(err)
  }
})

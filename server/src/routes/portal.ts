import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
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
        SELECT id, doc_type AS "docType", file_name AS "fileName",
          mime_type AS "mimeType", created_at AS "createdAt"
        FROM documents
        WHERE tenant_id = ${id} AND org_id = ${req.orgId!}
        ORDER BY created_at DESC
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
        a.status,
        a.ticket_manager AS "ticketManager",
        b.name AS "buildingName",
        b.address AS "buildingAddress",
        t.id AS "tenantId",
        t.name AS "tenantName",
        t.email AS "tenantEmail",
        t.phone AS "tenantPhone",
        t.status AS "tenantStatus",
        t.lease_start AS "leaseStart",
        t.lease_end AS "leaseEnd",
        (
          SELECT count(*)::int FROM issues i
          WHERE i.tenant_id = t.id AND i.status IN ('open', 'pending')
        ) AS "openIssues"
      FROM apartments a
      JOIN buildings b ON b.id = a.building_id
      LEFT JOIN tenants t ON t.apartment_id = a.id
        AND t.status IN ('active', 'notice')
        AND t.application_id IS NOT NULL
      WHERE a.landlord_id = ${landlordId} AND a.org_id = ${req.orgId!}
      ORDER BY
        CASE WHEN t.id IS NULL THEN 1 ELSE 0 END,
        t.name NULLS LAST,
        b.name,
        a.unit_number
    `

    res.json({
      data: {
        landlord: landlord[0],
        units,
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
        newBuildingAddress: z.string().max(240).optional(),
        unitNumber: z.string().min(1).max(40),
        rent: z.number().positive(),
        deposit: z.number().nonnegative(),
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

    const rows = await sql`
      INSERT INTO apartments (
        org_id, building_id, landlord_id, unit_number, rent, deposit, status
      )
      VALUES (
        ${req.orgId!}, ${buildingId}, ${landlordId}, ${body.unitNumber.trim()},
        ${body.rent}, ${body.deposit}, 'vacant'
      )
      RETURNING id, unit_number AS "unitNumber", rent::float8 AS rent,
        deposit::float8 AS deposit, status, building_id AS "buildingId",
        landlord_id AS "landlordId"
    `

    res.status(201).json({ data: rows[0] })
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

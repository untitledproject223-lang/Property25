import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'
import type { AuthTokenPayload } from '../lib/auth.js'

export const invoicesRouter = Router()
invoicesRouter.use(requireAuth)

const itemSchema = z.object({
  type: z.enum(['rent', 'deposit', 'admin', 'maintenance', 'other']),
  description: z.string().min(1).max(200),
  amount: z.number(),
})

const createSchema = z.object({
  tenantId: z.string().uuid(),
  dueDate: z.string().date(),
  items: z.array(itemSchema).min(1),
  status: z.enum(['draft', 'sent', 'paid', 'overdue']).default('sent'),
  notes: z.string().max(2000).optional(),
  issuedAt: z.string().date().optional(),
  billingKind: z.enum(['recurring', 'one_time']).default('one_time'),
  isRecurring: z.boolean().optional(),
  issueId: z.string().uuid().optional(),
})

function mapInvoice(row: Record<string, unknown>) {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    issuedAt: row.issuedAt ?? row.issued_at,
    dueDate: row.dueDate ?? row.due_date,
    items: row.items ?? row.items_json,
    total: row.total,
    status: row.status,
    notes: row.notes,
    isRecurring: row.isRecurring ?? row.is_recurring,
    billingKind: row.billingKind ?? row.billing_kind,
    issueId: row.issueId ?? row.issue_id ?? null,
  }
}

async function loadInvoiceDetail(auth: AuthTokenPayload, invoiceId: string) {
  if (auth.role === 'admin' || auth.role === 'agent') {
    const rows = await sql`
      SELECT
        i.id, i.tenant_id AS "tenantId", i.issued_at AS "issuedAt", i.due_date AS "dueDate",
        i.items_json AS items, i.total::float8 AS total, i.status, i.notes,
        i.is_recurring AS "isRecurring", i.billing_kind AS "billingKind",
        i.issue_id AS "issueId",
        t.name AS "tenantName", t.email AS "tenantEmail", t.phone AS "tenantPhone",
        a.unit_number AS "unitNumber", a.rent::float8 AS rent, a.deposit::float8 AS deposit,
        b.name AS "buildingName", b.address AS "buildingAddress",
        l.name AS "landlordName",
        iss.subject AS "issueSubject"
      FROM invoices i
      JOIN tenants t ON t.id = i.tenant_id
      JOIN apartments a ON a.id = t.apartment_id
      JOIN buildings b ON b.id = a.building_id
      JOIN landlords l ON l.id = a.landlord_id
      LEFT JOIN issues iss ON iss.id = i.issue_id
      WHERE i.id = ${invoiceId} AND i.org_id = ${auth.orgId}
      LIMIT 1
    `
    return rows[0] ?? null
  }

  if (auth.role === 'landlord') {
    const rows = await sql`
      SELECT
        i.id, i.tenant_id AS "tenantId", i.issued_at AS "issuedAt", i.due_date AS "dueDate",
        i.items_json AS items, i.total::float8 AS total, i.status, i.notes,
        i.is_recurring AS "isRecurring", i.billing_kind AS "billingKind",
        i.issue_id AS "issueId",
        t.name AS "tenantName", t.email AS "tenantEmail", t.phone AS "tenantPhone",
        a.unit_number AS "unitNumber", a.rent::float8 AS rent, a.deposit::float8 AS deposit,
        b.name AS "buildingName", b.address AS "buildingAddress",
        l.name AS "landlordName",
        iss.subject AS "issueSubject"
      FROM invoices i
      JOIN tenants t ON t.id = i.tenant_id
      JOIN apartments a ON a.id = t.apartment_id
      JOIN buildings b ON b.id = a.building_id
      JOIN landlords l ON l.id = a.landlord_id
      LEFT JOIN issues iss ON iss.id = i.issue_id
      WHERE i.id = ${invoiceId}
        AND i.org_id = ${auth.orgId}
        AND l.user_id = ${auth.sub}
      LIMIT 1
    `
    return rows[0] ?? null
  }

  if (auth.role === 'tenant') {
    const rows = await sql`
      SELECT
        i.id, i.tenant_id AS "tenantId", i.issued_at AS "issuedAt", i.due_date AS "dueDate",
        i.items_json AS items, i.total::float8 AS total, i.status, i.notes,
        i.is_recurring AS "isRecurring", i.billing_kind AS "billingKind",
        i.issue_id AS "issueId",
        t.name AS "tenantName", t.email AS "tenantEmail", t.phone AS "tenantPhone",
        a.unit_number AS "unitNumber", a.rent::float8 AS rent, a.deposit::float8 AS deposit,
        b.name AS "buildingName", b.address AS "buildingAddress",
        l.name AS "landlordName",
        iss.subject AS "issueSubject"
      FROM invoices i
      JOIN tenants t ON t.id = i.tenant_id
      JOIN apartments a ON a.id = t.apartment_id
      JOIN buildings b ON b.id = a.building_id
      JOIN landlords l ON l.id = a.landlord_id
      LEFT JOIN issues iss ON iss.id = i.issue_id
      WHERE i.id = ${invoiceId}
        AND i.org_id = ${auth.orgId}
        AND t.user_id = ${auth.sub}
        AND i.status <> 'draft'
      LIMIT 1
    `
    return rows[0] ?? null
  }

  return null
}

invoicesRouter.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const row = await loadInvoiceDetail(req.auth!, id)
    if (!row) throw new AppError(404, 'Invoice not found')
    res.json({
      data: {
        ...mapInvoice(row as Record<string, unknown>),
        tenantName: row.tenantName,
        tenantEmail: row.tenantEmail,
        tenantPhone: row.tenantPhone,
        unitNumber: row.unitNumber,
        rent: row.rent,
        deposit: row.deposit,
        buildingName: row.buildingName,
        buildingAddress: row.buildingAddress,
        landlordName: row.landlordName,
        issueSubject: row.issueSubject ?? null,
      },
    })
  } catch (err) {
    next(err)
  }
})


async function assertCanInvoiceTenant(auth: AuthTokenPayload, tenantId: string) {
  if (auth.role === 'admin' || auth.role === 'agent') {
    const tenant = await sql`
      SELECT id FROM tenants WHERE id = ${tenantId} AND org_id = ${auth.orgId} LIMIT 1
    `
    if (tenant.length === 0) throw new AppError(400, 'tenantId not found in this org')
    return
  }
  if (auth.role === 'landlord') {
    const tenant = await sql`
      SELECT t.id
      FROM tenants t
      JOIN apartments a ON a.id = t.apartment_id
      JOIN landlords l ON l.id = a.landlord_id
      WHERE t.id = ${tenantId}
        AND t.org_id = ${auth.orgId}
        AND l.user_id = ${auth.sub}
      LIMIT 1
    `
    if (tenant.length === 0) {
      throw new AppError(403, 'You can only invoice tenants on your units')
    }
    return
  }
  throw new AppError(403, 'Only an agent or landlord can create invoices')
}

/** Maintenance tickets where the tenant (or split) must pay. */
async function assertBillableIssue(
  auth: AuthTokenPayload,
  issueId: string,
  tenantId: string,
) {
  const rows = await sql`
    SELECT i.id, i.tenant_id, i.issue_type, i.decision_json, i.status
    FROM issues i
    WHERE i.id = ${issueId} AND i.org_id = ${auth.orgId}
    LIMIT 1
  `
  if (rows.length === 0) throw new AppError(400, 'Ticket not found')
  const issue = rows[0]
  if (String(issue.tenant_id) !== tenantId) {
    throw new AppError(400, 'Ticket does not belong to the selected tenant')
  }
  if (String(issue.issue_type) !== 'maintenance') {
    throw new AppError(400, 'Only maintenance tickets can be attached to an invoice')
  }
  const decision =
    issue.decision_json && typeof issue.decision_json === 'object'
      ? (issue.decision_json as Record<string, unknown>)
      : {}
  const payer = String(decision.payer ?? '')
  if (decision.outcome !== 'conditional' || (payer !== 'tenant' && payer !== 'split')) {
    throw new AppError(
      400,
      'An invoice can only be attached when the tenant is responsible for maintenance payment',
    )
  }
  return { issue, decision, payer }
}

function tenantPayableAmount(decision: Record<string, unknown>, payer: string) {
  const total = Number(decision.totalCost ?? 0)
  if (payer === 'split') {
    const share = Number(decision.tenantShare ?? 0)
    return Math.round(total * (share / 100) * 100) / 100
  }
  return total
}

invoicesRouter.post('/', async (req, res, next) => {
  try {
    const auth = req.auth!
    const body = createSchema.parse(req.body)
    await assertCanInvoiceTenant(auth, body.tenantId)

    let issueId: string | null = null
    if (body.issueId) {
      const { decision, payer } = await assertBillableIssue(
        auth,
        body.issueId,
        body.tenantId,
      )
      issueId = body.issueId
      // If caller sent no meaningful maintenance amount, they still must pass items;
      // validate at least one maintenance line when linking a ticket.
      const hasMaintenance = body.items.some((i) => i.type === 'maintenance')
      if (!hasMaintenance) {
        throw new AppError(
          400,
          'Ticket-linked invoices must include a maintenance line item',
        )
      }
      const expected = tenantPayableAmount(decision, payer)
      if (expected > 0) {
        const maintenanceTotal = body.items
          .filter((i) => i.type === 'maintenance')
          .reduce((s, i) => s + i.amount, 0)
        if (maintenanceTotal <= 0) {
          throw new AppError(400, 'Maintenance amount must be greater than zero')
        }
      }
    }

    const total = body.items.reduce((sum, item) => sum + item.amount, 0)
    const issuedAt = body.issuedAt ?? new Date().toISOString().slice(0, 10)
    const billingKind =
      body.billingKind ?? (body.isRecurring ? 'recurring' : 'one_time')
    const isRecurring = body.isRecurring ?? billingKind === 'recurring'
    // Ticket-linked invoices are never recurring rent schedules
    const finalBillingKind = issueId ? 'one_time' : billingKind
    const finalIsRecurring = issueId ? false : isRecurring
    // Created invoices are visible to the tenant unless explicitly saved as draft
    const status = body.status ?? 'sent'

    const rows = await sql`
      INSERT INTO invoices (
        org_id, tenant_id, issued_at, due_date, items_json, total, status, notes,
        is_recurring, billing_kind, issue_id
      )
      VALUES (
        ${auth.orgId}, ${body.tenantId}, ${issuedAt}, ${body.dueDate},
        ${JSON.stringify(body.items)}::jsonb, ${total}, ${status}, ${body.notes ?? null},
        ${finalIsRecurring}, ${finalBillingKind}, ${issueId}
      )
      RETURNING id, tenant_id AS "tenantId", issued_at AS "issuedAt", due_date AS "dueDate",
        items_json AS items, total::float8 AS total, status, notes,
        is_recurring AS "isRecurring", billing_kind AS "billingKind",
        issue_id AS "issueId"
    `
    res.status(201).json({ data: mapInvoice(rows[0] as Record<string, unknown>) })
  } catch (err) {
    next(err)
  }
})

invoicesRouter.patch('/:id', async (req, res, next) => {
  try {
    const auth = req.auth!
    const id = z.string().uuid().parse(req.params.id)
    const body = z
      .object({
        status: z.enum(['draft', 'sent', 'paid', 'overdue']).optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(req.body)

    if (auth.role === 'landlord') {
      const owned = await sql`
        SELECT i.id
        FROM invoices i
        JOIN tenants t ON t.id = i.tenant_id
        JOIN apartments a ON a.id = t.apartment_id
        JOIN landlords l ON l.id = a.landlord_id
        WHERE i.id = ${id}
          AND i.org_id = ${auth.orgId}
          AND l.user_id = ${auth.sub}
        LIMIT 1
      `
      if (owned.length === 0) throw new AppError(404, 'Invoice not found')
    } else if (auth.role !== 'admin' && auth.role !== 'agent') {
      throw new AppError(403, 'Cannot update invoices')
    }

    const rows = await sql`
      UPDATE invoices
      SET
        status = COALESCE(${body.status ?? null}, status),
        notes = COALESCE(${body.notes ?? null}, notes),
        updated_at = now()
      WHERE id = ${id} AND org_id = ${auth.orgId}
      RETURNING id, tenant_id AS "tenantId", issued_at AS "issuedAt", due_date AS "dueDate",
        items_json AS items, total::float8 AS total, status, notes,
        is_recurring AS "isRecurring", billing_kind AS "billingKind",
        issue_id AS "issueId"
    `
    if (rows.length === 0) throw new AppError(404, 'Invoice not found')
    res.json({ data: mapInvoice(rows[0] as Record<string, unknown>) })
  } catch (err) {
    next(err)
  }
})

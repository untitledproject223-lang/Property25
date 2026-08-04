import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'
import type { AuthTokenPayload } from '../lib/auth.js'

export const issuesRouter = Router()
issuesRouter.use(requireAuth)

async function assertIssueAccess(auth: AuthTokenPayload, issueId: string) {
  if (auth.role === 'admin' || auth.role === 'agent') {
    const rows = await sql`
      SELECT i.*, a.ticket_manager
      FROM issues i
      JOIN tenants t ON t.id = i.tenant_id
      JOIN apartments a ON a.id = t.apartment_id
      WHERE i.id = ${issueId} AND i.org_id = ${auth.orgId}
      LIMIT 1
    `
    return rows[0] ?? null
  }
  if (auth.role === 'tenant') {
    const rows = await sql`
      SELECT i.*, a.ticket_manager
      FROM issues i
      JOIN tenants t ON t.id = i.tenant_id
      JOIN apartments a ON a.id = t.apartment_id
      WHERE i.id = ${issueId}
        AND i.org_id = ${auth.orgId}
        AND t.user_id = ${auth.sub}
      LIMIT 1
    `
    return rows[0] ?? null
  }
  if (auth.role === 'landlord') {
    const rows = await sql`
      SELECT i.*, a.ticket_manager
      FROM issues i
      JOIN tenants t ON t.id = i.tenant_id
      JOIN apartments a ON a.id = t.apartment_id
      JOIN landlords l ON l.id = a.landlord_id
      WHERE i.id = ${issueId}
        AND i.org_id = ${auth.orgId}
        AND l.user_id = ${auth.sub}
      LIMIT 1
    `
    return rows[0] ?? null
  }
  return null
}

function mapIssue(row: Record<string, unknown>) {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? row.tenantId,
    subject: row.subject,
    status: row.status,
    severity: row.severity,
    audience: row.audience,
    issueType: row.issue_type ?? row.issueType,
    managementOwner: row.management_owner ?? row.managementOwner,
    decision: row.decision_json ?? row.decision ?? {},
    createdAt: row.created_at ?? row.createdAt,
    messages: row.messages_json ?? row.messages ?? [],
  }
}

function managementOwnerOf(row: Record<string, unknown>) {
  return String(row.management_owner ?? row.managementOwner ?? 'landlord')
}

function canDecideTicket(auth: AuthTokenPayload, managementOwner: string) {
  if (auth.role === 'admin') return true
  if (managementOwner === 'landlord' && auth.role === 'landlord') return true
  if (managementOwner === 'agent' && auth.role === 'agent') return true
  return false
}

function isTicketAccepted(decision: Record<string, unknown>) {
  const outcome = String(decision.outcome ?? '')
  return outcome === 'accept' || outcome === 'conditional'
}

issuesRouter.get('/', async (req, res, next) => {
  try {
    const auth = req.auth!
    let rows

    if (auth.role === 'admin' || auth.role === 'agent') {
      rows = await sql`
        SELECT i.id, i.tenant_id, i.subject, i.status, i.severity, i.audience,
          i.issue_type, i.management_owner, i.decision_json, i.created_at, i.messages_json,
          t.name AS tenant_name
        FROM issues i
        JOIN tenants t ON t.id = i.tenant_id
        WHERE i.org_id = ${auth.orgId}
        ORDER BY i.created_at DESC
      `
    } else if (auth.role === 'tenant') {
      rows = await sql`
        SELECT i.id, i.tenant_id, i.subject, i.status, i.severity, i.audience,
          i.issue_type, i.management_owner, i.decision_json, i.created_at, i.messages_json,
          t.name AS tenant_name
        FROM issues i
        JOIN tenants t ON t.id = i.tenant_id
        WHERE i.org_id = ${auth.orgId} AND t.user_id = ${auth.sub}
        ORDER BY i.created_at DESC
      `
    } else {
      rows = await sql`
        SELECT i.id, i.tenant_id, i.subject, i.status, i.severity, i.audience,
          i.issue_type, i.management_owner, i.decision_json, i.created_at, i.messages_json,
          t.name AS tenant_name
        FROM issues i
        JOIN tenants t ON t.id = i.tenant_id
        JOIN apartments a ON a.id = t.apartment_id
        JOIN landlords l ON l.id = a.landlord_id
        WHERE i.org_id = ${auth.orgId} AND l.user_id = ${auth.sub}
        ORDER BY i.created_at DESC
      `
    }

    res.json({
      data: rows.map((r) => ({
        ...mapIssue(r as Record<string, unknown>),
        tenantName: r.tenant_name,
      })),
    })
  } catch (err) {
    next(err)
  }
})

const createSchema = z.object({
  tenantId: z.string().uuid().optional(),
  subject: z.string().min(1).max(200),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  audience: z.enum(['agent', 'landlord', 'both']).optional(),
  issueType: z.enum(['maintenance', 'general', 'invoice']).default('general'),
  message: z.string().min(1).max(4000).optional(),
})

issuesRouter.post('/', async (req, res, next) => {
  try {
    const auth = req.auth!
    const body = createSchema.parse(req.body)

    let tenantId = body.tenantId
    if (auth.role === 'tenant') {
      const t = await sql`
        SELECT t.id, a.ticket_manager
        FROM tenants t
        JOIN apartments a ON a.id = t.apartment_id
        WHERE t.user_id = ${auth.sub}
          AND t.org_id = ${auth.orgId}
          AND t.status IN ('active', 'notice')
        ORDER BY t.updated_at DESC
        LIMIT 1
      `
      if (t.length === 0) throw new AppError(400, 'No active tenancy found')
      tenantId = String(t[0].id)
      const ticketManager = String(t[0].ticket_manager) as 'landlord' | 'agent'
      const author = 'tenant'
      const managementOwner = ticketManager
      const audience =
        body.audience ?? (ticketManager === 'agent' ? 'agent' : 'landlord')

      const messages = body.message
        ? [
            {
              id: crypto.randomUUID(),
              author,
              body: body.message,
              at: new Date().toISOString(),
            },
          ]
        : []

      const rows = await sql`
        INSERT INTO issues (
          org_id, tenant_id, subject, status, severity, audience,
          issue_type, management_owner, messages_json
        )
        VALUES (
          ${auth.orgId}, ${tenantId}, ${body.subject}, 'open',
          ${body.severity}, ${audience}, ${body.issueType}, ${managementOwner},
          ${JSON.stringify(messages)}::jsonb
        )
        RETURNING id, tenant_id, subject, status, severity, audience,
          issue_type, management_owner, decision_json, created_at, messages_json
      `
      return res.status(201).json({ data: mapIssue(rows[0] as Record<string, unknown>) })
    }

    if (auth.role !== 'admin' && auth.role !== 'agent' && auth.role !== 'landlord') {
      throw new AppError(403, 'Cannot create issues')
    }
    if (!tenantId) throw new AppError(400, 'tenantId is required')

    const tenant = await sql`
      SELECT t.id, a.ticket_manager
      FROM tenants t
      JOIN apartments a ON a.id = t.apartment_id
      WHERE t.id = ${tenantId} AND t.org_id = ${auth.orgId}
      LIMIT 1
    `
    if (tenant.length === 0) throw new AppError(400, 'tenantId not found in this org')

    const managementOwner = String(tenant[0].ticket_manager)
    const author = auth.role === 'landlord' ? 'landlord' : 'agent'
    const audience = body.audience ?? (auth.role === 'landlord' ? 'landlord' : 'agent')
    const messages = body.message
      ? [
          {
            id: crypto.randomUUID(),
            author,
            body: body.message,
            at: new Date().toISOString(),
          },
        ]
      : []

    const rows = await sql`
      INSERT INTO issues (
        org_id, tenant_id, subject, status, severity, audience,
        issue_type, management_owner, messages_json
      )
      VALUES (
        ${auth.orgId}, ${tenantId}, ${body.subject}, 'open',
        ${body.severity}, ${audience}, ${body.issueType}, ${managementOwner},
        ${JSON.stringify(messages)}::jsonb
      )
      RETURNING id, tenant_id, subject, status, severity, audience,
        issue_type, management_owner, decision_json, created_at, messages_json
    `
    res.status(201).json({ data: mapIssue(rows[0] as Record<string, unknown>) })
  } catch (err) {
    next(err)
  }
})

const decisionSchema = z.object({
  outcome: z.enum(['accept', 'reject', 'conditional']),
  payer: z.enum(['landlord', 'tenant', 'split']).optional(),
  landlordShare: z.number().min(0).max(100).optional(),
  tenantShare: z.number().min(0).max(100).optional(),
  workDescription: z.string().max(2000).optional(),
  materialsCost: z.number().min(0).optional(),
  labourCost: z.number().min(0).optional(),
  note: z.string().max(2000).optional(),
})

issuesRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const auth = req.auth!
    const body = z
      .object({
        status: z.enum(['open', 'pending', 'resolved', 'rejected']).optional(),
        reply: z
          .object({
            author: z.enum(['tenant', 'agent', 'landlord']).optional(),
            body: z.string().min(1).max(4000),
          })
          .optional(),
        decision: decisionSchema.optional(),
        close: z
          .object({
            result: z.enum(['successful', 'unsuccessful']),
            note: z.string().max(2000).optional(),
          })
          .optional(),
      })
      .parse(req.body)

    const existing = await assertIssueAccess(auth, id)
    if (!existing) throw new AppError(404, 'Issue not found')

    let messages = Array.isArray(existing.messages_json)
      ? [...existing.messages_json]
      : Array.isArray(existing.messages)
        ? [...existing.messages]
        : []
    let status = body.status ?? existing.status
    let decision =
      existing.decision_json && typeof existing.decision_json === 'object'
        ? { ...(existing.decision_json as Record<string, unknown>) }
        : {}
    const managementOwner = managementOwnerOf(existing as Record<string, unknown>)
    const issueType = String(existing.issue_type ?? 'general')
    const existingStatus = String(existing.status)

    if (body.reply) {
      if (existingStatus === 'resolved' || existingStatus === 'rejected') {
        throw new AppError(400, 'This ticket is closed')
      }
      if (!isTicketAccepted(decision)) {
        throw new AppError(
          400,
          'This ticket must be accepted before correspondence can begin',
        )
      }
      const author =
        body.reply.author ??
        (auth.role === 'tenant'
          ? 'tenant'
          : auth.role === 'landlord'
            ? 'landlord'
            : 'agent')
      messages.push({
        id: crypto.randomUUID(),
        author,
        body: body.reply.body,
        at: new Date().toISOString(),
      })
      if (status !== 'resolved' && status !== 'rejected') status = 'pending'
    }

    if (body.decision) {
      if (!canDecideTicket(auth, managementOwner)) {
        throw new AppError(
          403,
          managementOwner === 'agent'
            ? 'Only the managing agent can accept or reject this ticket'
            : 'Only the landlord can accept or reject this ticket',
        )
      }
      if (decision.outcome) {
        throw new AppError(400, 'A decision has already been recorded for this ticket')
      }
      if (existingStatus === 'resolved' || existingStatus === 'rejected') {
        throw new AppError(400, 'This ticket is already closed')
      }

      const d = body.decision
      if (d.outcome === 'conditional' && issueType !== 'maintenance') {
        throw new AppError(400, 'Conditional approval applies to maintenance tickets only')
      }

      const materials = d.materialsCost ?? 0
      const labour = d.labourCost ?? 0
      const decider = auth.role === 'landlord' ? 'landlord' : 'agent'
      decision = {
        ...decision,
        outcome: d.outcome,
        payer:
          d.outcome === 'accept'
            ? issueType === 'maintenance'
              ? 'landlord'
              : undefined
            : d.outcome === 'reject'
              ? undefined
              : (d.payer ?? 'tenant'),
        landlordShare: d.landlordShare,
        tenantShare: d.tenantShare,
        workDescription: d.workDescription,
        materialsCost: issueType === 'maintenance' ? materials : undefined,
        labourCost: issueType === 'maintenance' ? labour : undefined,
        totalCost: issueType === 'maintenance' ? materials + labour : undefined,
        note: d.note,
        decidedAt: new Date().toISOString(),
        decidedBy: auth.role,
      }

      if (d.outcome === 'reject') {
        status = 'rejected'
        messages.push({
          id: crypto.randomUUID(),
          author: decider,
          body:
            d.note?.trim() ||
            (issueType === 'maintenance'
              ? 'Ticket rejected. No work will be carried out under this ticket.'
              : 'Ticket rejected. No further correspondence will take place on this ticket.'),
          at: new Date().toISOString(),
        })
      } else if (d.outcome === 'accept') {
        status = 'pending'
        const costNote =
          issueType === 'maintenance'
            ? ` Cost will be incurred by the landlord.${
                d.workDescription ? ` Work: ${d.workDescription}.` : ''
              } Materials R${materials}, labour R${labour}, total R${materials + labour}.`
            : d.workDescription
              ? ` Note: ${d.workDescription}.`
              : ''
        messages.push({
          id: crypto.randomUUID(),
          author: decider,
          body: `Ticket accepted by the ${decider}.${costNote} Correspondence is now open.`,
          at: new Date().toISOString(),
        })
      } else {
        status = 'pending'
        const payerLabel =
          d.payer === 'split'
            ? `split (landlord ${d.landlordShare ?? 0}% / tenant ${d.tenantShare ?? 0}%)`
            : 'tenant'
        messages.push({
          id: crypto.randomUUID(),
          author: decider,
          body: `Ticket approved conditionally. Payment responsibility: ${payerLabel}.${
            d.workDescription ? ` Work: ${d.workDescription}.` : ''
          } Materials R${materials}, labour R${labour}, total R${materials + labour}. Correspondence is now open.`,
          at: new Date().toISOString(),
        })
      }
    }

    if (body.close) {
      if (existingStatus === 'resolved' || existingStatus === 'rejected') {
        throw new AppError(400, 'This ticket is already closed')
      }
      if (!isTicketAccepted(decision)) {
        throw new AppError(400, 'Only an accepted ticket can be closed with an outcome')
      }
      const closer =
        auth.role === 'tenant'
          ? 'tenant'
          : auth.role === 'landlord'
            ? 'landlord'
            : 'agent'
      const resultLabel =
        body.close.result === 'successful' ? 'successful' : 'not successful'
      decision = {
        ...decision,
        closureResult: body.close.result,
        closedAt: new Date().toISOString(),
        closedBy: closer,
        closureNote: body.close.note,
      }
      status = 'resolved'
      messages.push({
        id: crypto.randomUUID(),
        author: closer,
        body:
          body.close.note?.trim() ||
          `Ticket closed as ${resultLabel} by the ${closer}.`,
        at: new Date().toISOString(),
      })
    }

    // Prevent resolving via status without an acceptance first
    if (
      body.status === 'resolved' &&
      !body.close &&
      !isTicketAccepted(decision) &&
      String(existing.status) !== 'resolved'
    ) {
      throw new AppError(400, 'Accept the ticket before closing it')
    }

    const rows = await sql`
      UPDATE issues
      SET
        status = ${status},
        messages_json = ${JSON.stringify(messages)}::jsonb,
        decision_json = ${JSON.stringify(decision)}::jsonb,
        updated_at = now()
      WHERE id = ${id} AND org_id = ${auth.orgId}
      RETURNING id, tenant_id, subject, status, severity, audience,
        issue_type, management_owner, decision_json, created_at, messages_json
    `
    res.json({ data: mapIssue(rows[0] as Record<string, unknown>) })
  } catch (err) {
    next(err)
  }
})

import { Router } from 'express'
import { sql } from '../db/client.js'
import { requireAuth, requireAgent } from '../middleware/auth.js'

export const dashboardRouter = Router()
dashboardRouter.use(requireAuth, requireAgent)

/** Aggregate payload shaped for the existing React dashboard. */
dashboardRouter.get('/', async (req, res, next) => {
  try {
    const orgId = req.orgId!

    const [buildings, landlords, apartments, tenants, payments, invoices, issues, activityLog, landlordUpdates] =
      await Promise.all([
        sql`SELECT id, name, address FROM buildings WHERE org_id = ${orgId} ORDER BY name`,
        sql`SELECT id, name, email, phone, whatsapp FROM landlords WHERE org_id = ${orgId} ORDER BY name`,
        sql`
          SELECT id, building_id AS "buildingId", unit_number AS "unitNumber",
            rent::float8 AS rent, deposit::float8 AS deposit, status,
            next_due_date AS "nextDueDate", landlord_id AS "landlordId",
            ticket_manager AS "ticketManager"
          FROM apartments WHERE org_id = ${orgId}
          ORDER BY unit_number
        `,
        sql`
          SELECT id, apartment_id AS "apartmentId", name, email, phone, whatsapp,
            lease_start AS "leaseStart", lease_end AS "leaseEnd", status,
            balance::float8 AS balance, docs_json AS docs,
            move_in_inspection_json AS "moveInInspection",
            user_id AS "userId",
            application_id AS "applicationId"
          FROM tenants
          WHERE org_id = ${orgId}
            AND application_id IS NOT NULL
          ORDER BY name
        `,
        sql`
          SELECT id, tenant_id AS "tenantId", paid_at AS date, type,
            amount::float8 AS amount, method, status, proof_name AS "proofName", note
          FROM payments WHERE org_id = ${orgId}
          ORDER BY paid_at DESC
        `,
        sql`
          SELECT id, tenant_id AS "tenantId", issued_at AS "issuedAt", due_date AS "dueDate",
            items_json AS items, total::float8 AS total, status, notes,
            is_recurring AS "isRecurring", billing_kind AS "billingKind",
            issue_id AS "issueId"
          FROM invoices WHERE org_id = ${orgId}
          ORDER BY issued_at DESC
        `,
        sql`
          SELECT id, tenant_id AS "tenantId", subject, status, severity, audience,
            issue_type AS "issueType", management_owner AS "managementOwner",
            decision_json AS decision,
            created_at AS "createdAt", messages_json AS messages
          FROM issues WHERE org_id = ${orgId}
          ORDER BY created_at DESC
        `,
        sql`
          SELECT id, tenant_id AS "tenantId", landlord_id AS "landlordId",
            kind, channel, body, at
          FROM activity_log WHERE org_id = ${orgId}
          ORDER BY at DESC
          LIMIT 200
        `,
        sql`
          SELECT id, landlord_id AS "landlordId", tenant_id AS "tenantId",
            body, channel, at
          FROM landlord_updates WHERE org_id = ${orgId}
          ORDER BY at DESC
          LIMIT 200
        `,
      ])

    res.json({
      data: {
        buildings,
        landlords,
        apartments,
        tenants,
        payments,
        invoices,
        issues,
        landlordUpdates,
        activityLog,
      },
    })
  } catch (err) {
    next(err)
  }
})

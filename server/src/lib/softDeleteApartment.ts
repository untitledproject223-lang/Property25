import { sql } from '../db/client.js'
import { AppError } from '../middleware/error.js'

/** Soft-delete a unit: end current leases, close tickets, hide from active unit lists. */
export async function softDeleteApartment(opts: {
  apartmentId: string
  orgId: string
  actor: 'agent' | 'landlord'
}) {
  const existing = await sql`
    SELECT id, status, deleted_at
    FROM apartments
    WHERE id = ${opts.apartmentId} AND org_id = ${opts.orgId}
    LIMIT 1
  `
  if (existing.length === 0) throw new AppError(404, 'Apartment not found')
  if (existing[0].deleted_at) {
    throw new AppError(400, 'This unit is already deleted')
  }

  const closedTenants = await sql`
    UPDATE tenants
    SET
      status = 'former',
      lease_end = COALESCE(lease_end, CURRENT_DATE),
      terminated_at = COALESCE(terminated_at, CURRENT_DATE),
      termination_reason = COALESCE(
        termination_reason,
        'Unit deleted'
      ),
      updated_at = now()
    WHERE apartment_id = ${opts.apartmentId}
      AND org_id = ${opts.orgId}
      AND status IN ('active', 'notice')
    RETURNING id
  `

  const closedTenantIds = closedTenants.map((r) => String(r.id))
  if (closedTenantIds.length > 0) {
    await sql`
      UPDATE issues
      SET
        status = 'resolved',
        updated_at = now(),
        messages_json = COALESCE(messages_json, '[]'::jsonb) || ${JSON.stringify([
          {
            id: crypto.randomUUID(),
            author: opts.actor,
            body: 'Ticket closed automatically because the unit was deleted.',
            at: new Date().toISOString(),
          },
        ])}::jsonb
      WHERE org_id = ${opts.orgId}
        AND tenant_id = ANY(${closedTenantIds}::uuid[])
        AND status IN ('open', 'pending')
    `
  }

  const rows = await sql`
    UPDATE apartments
    SET
      status = 'vacant',
      deleted_at = now(),
      updated_at = now()
    WHERE id = ${opts.apartmentId} AND org_id = ${opts.orgId}
    RETURNING id, unit_number AS "unitNumber", deleted_at AS "deletedAt"
  `

  return rows[0]
}

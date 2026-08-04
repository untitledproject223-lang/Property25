import type { AuthTokenPayload } from './auth.js'
import { sql } from '../db/client.js'

/** Whether the authenticated user may load this application. */
export async function canAccessApplication(
  auth: AuthTokenPayload,
  applicationId: string,
): Promise<boolean> {
  if (auth.role === 'admin' || auth.role === 'agent') {
    const rows = await sql`
      SELECT id FROM applications
      WHERE id = ${applicationId} AND org_id = ${auth.orgId}
      LIMIT 1
    `
    return rows.length > 0
  }

  if (auth.role === 'tenant') {
    const rows = await sql`
      SELECT a.id
      FROM applications a
      WHERE a.id = ${applicationId}
        AND a.org_id = ${auth.orgId}
        AND (
          a.applicant_user_id = ${auth.sub}
          OR lower(a.applicant_email) = lower(${auth.email})
        )
      LIMIT 1
    `
    return rows.length > 0
  }

  if (auth.role === 'landlord') {
    const rows = auth.profileId
      ? await sql`
          SELECT a.id
          FROM applications a
          JOIN apartments apt ON apt.id = a.apartment_id
          JOIN landlords l ON l.id = apt.landlord_id
          WHERE a.id = ${applicationId}
            AND a.org_id = ${auth.orgId}
            AND (l.user_id = ${auth.sub} OR l.id = ${auth.profileId})
          LIMIT 1
        `
      : await sql`
          SELECT a.id
          FROM applications a
          JOIN apartments apt ON apt.id = a.apartment_id
          JOIN landlords l ON l.id = apt.landlord_id
          WHERE a.id = ${applicationId}
            AND a.org_id = ${auth.orgId}
            AND l.user_id = ${auth.sub}
          LIMIT 1
        `
    return rows.length > 0
  }

  return false
}

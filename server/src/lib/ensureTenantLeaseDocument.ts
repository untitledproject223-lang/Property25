import { sql } from '../db/client.js'
import { AppError } from '../middleware/error.js'
import { buildSignedLeasePdf } from './buildSignedLeasePdf.js'

export type LeaseDocumentRow = {
  id: string
  filename: string
  mimeType: string
  contentBase64: string
  sizeBytes: number
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : value != null ? String(value) : ''
}

function hasSignatures(form: Record<string, unknown>) {
  const tenant = asString(form.signApplicantMark)
  const landlord = asString(form.signLandlordMark)
  return tenant.startsWith('data:image/') && landlord.startsWith('data:image/')
}

/** Find or create a signed lease PDF for download. */
export async function ensureTenantLeaseDocument(opts: {
  orgId: string
  tenantId?: string | null
  applicationId?: string | null
}): Promise<LeaseDocumentRow> {
  const tenantId = opts.tenantId ?? null
  let applicationId = opts.applicationId ?? null
  if (!tenantId && !applicationId) {
    throw new AppError(400, 'tenantId or applicationId is required')
  }

  if (!applicationId && tenantId) {
    const tenant = await sql`
      SELECT application_id
      FROM tenants
      WHERE id = ${tenantId} AND org_id = ${opts.orgId}
      LIMIT 1
    `
    applicationId = tenant[0]?.application_id ? String(tenant[0].application_id) : null
  }

  if (!applicationId) {
    throw new AppError(404, 'No lease agreement is available for this tenancy yet')
  }

  const payload = await sql`
    SELECT form_json
    FROM application_payloads
    WHERE application_id = ${applicationId} AND org_id = ${opts.orgId}
    LIMIT 1
  `
  const form = (payload[0]?.form_json ?? {}) as Record<string, unknown>
  if (!asString(form.leasePdfDataUrl) && !asString(form.leaseDocumentHtml)) {
    throw new AppError(404, 'No lease agreement is available for this tenancy yet')
  }

  const signed = await buildSignedLeasePdf(form)
  const signedFlag = hasSignatures(form) ? 'signed' : 'unsigned'

  // Prefer a fresh PDF each download so newly captured signatures are included.
  await sql`
    DELETE FROM documents
    WHERE org_id = ${opts.orgId}
      AND application_id = ${applicationId}
      AND (
        lower(doc_type) LIKE '%lease%'
        OR lower(filename) LIKE '%lease%'
      )
  `
  if (tenantId) {
    await sql`
      DELETE FROM documents
      WHERE org_id = ${opts.orgId}
        AND tenant_id = ${tenantId}
        AND (
          lower(doc_type) LIKE '%lease%'
          OR lower(filename) LIKE '%lease%'
        )
    `
  }

  const rows = await sql`
    INSERT INTO documents (
      org_id, application_id, tenant_id, doc_type, filename, mime_type, size_bytes, content_base64
    )
    VALUES (
      ${opts.orgId},
      ${applicationId},
      ${tenantId},
      ${`lease-${signedFlag}`},
      ${signed.filename},
      ${signed.mimeType},
      ${signed.sizeBytes},
      ${signed.contentBase64}
    )
    RETURNING
      id,
      filename,
      mime_type AS "mimeType",
      content_base64 AS "contentBase64",
      size_bytes AS "sizeBytes"
  `

  if (tenantId) {
    const docs = await sql`
      SELECT docs_json FROM tenants WHERE id = ${tenantId} AND org_id = ${opts.orgId} LIMIT 1
    `
    const current = (docs[0]?.docs_json as Record<string, string>) ?? {}
    await sql`
      UPDATE tenants
      SET
        docs_json = ${JSON.stringify({ ...current, leaseFile: signed.filename })}::jsonb,
        updated_at = now()
      WHERE id = ${tenantId} AND org_id = ${opts.orgId}
    `
  }

  const created = rows[0]
  return {
    id: String(created.id),
    filename: String(created.filename),
    mimeType: String(created.mimeType),
    contentBase64: String(created.contentBase64),
    sizeBytes: Number(created.sizeBytes) || signed.sizeBytes,
  }
}

/** Whether the caller may download the lease for this tenant. */
export async function assertCanDownloadTenantLease(opts: {
  orgId: string
  userId: string
  email: string
  role: string
  profileId?: string | null
  tenantId: string
}) {
  const rows = await sql`
    SELECT
      t.id,
      t.user_id,
      t.email,
      t.application_id,
      a.landlord_id,
      l.user_id AS landlord_user_id
    FROM tenants t
    JOIN apartments a ON a.id = t.apartment_id
    JOIN landlords l ON l.id = a.landlord_id
    WHERE t.id = ${opts.tenantId} AND t.org_id = ${opts.orgId}
    LIMIT 1
  `
  if (rows.length === 0) throw new AppError(404, 'Tenant not found')

  const row = rows[0]
  if (opts.role === 'admin' || opts.role === 'agent') return row

  if (opts.role === 'tenant') {
    const linked =
      (row.user_id && String(row.user_id) === opts.userId) ||
      (typeof row.email === 'string' &&
        row.email.toLowerCase() === opts.email.toLowerCase())
    if (!linked) throw new AppError(403, 'Not allowed to download this lease')
    return row
  }

  if (opts.role === 'landlord') {
    const owns =
      String(row.landlord_user_id) === opts.userId ||
      (opts.profileId && String(row.landlord_id) === opts.profileId)
    if (!owns) throw new AppError(403, 'Not allowed to download this lease')
    return row
  }

  throw new AppError(403, 'Not allowed to download this lease')
}

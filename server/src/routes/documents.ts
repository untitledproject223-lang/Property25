import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'

export const documentsRouter = Router()
documentsRouter.use(requireAuth)

const uploadSchema = z.object({
  applicationId: z.string().uuid().optional().nullable(),
  tenantId: z.string().uuid().optional().nullable(),
  docType: z.string().min(1).max(80),
  filename: z.string().min(1).max(260),
  mimeType: z.string().min(1).max(120),
  contentBase64: z.string().min(1),
})

documentsRouter.post('/', async (req, res, next) => {
  try {
    const body = uploadSchema.parse(req.body)
    if (!body.applicationId && !body.tenantId) {
      throw new AppError(400, 'applicationId or tenantId is required')
    }

    // ~6MB decoded max
    const sizeBytes = Math.floor((body.contentBase64.length * 3) / 4)
    if (sizeBytes > 6_000_000) throw new AppError(413, 'File too large (max 6MB)')

    if (body.tenantId) {
      const t = await sql`
        SELECT id FROM tenants WHERE id = ${body.tenantId} AND org_id = ${req.orgId!} LIMIT 1
      `
      if (t.length === 0) throw new AppError(400, 'tenantId not found in this org')
    }
    if (body.applicationId) {
      const a = await sql`
        SELECT id FROM applications WHERE id = ${body.applicationId} AND org_id = ${req.orgId!} LIMIT 1
      `
      if (a.length === 0) throw new AppError(400, 'applicationId not found in this org')
    }

    const rows = await sql`
      INSERT INTO documents (
        org_id, application_id, tenant_id, doc_type, filename, mime_type, size_bytes, content_base64
      )
      VALUES (
        ${req.orgId!}, ${body.applicationId ?? null}, ${body.tenantId ?? null},
        ${body.docType}, ${body.filename}, ${body.mimeType}, ${sizeBytes}, ${body.contentBase64}
      )
      RETURNING id, application_id AS "applicationId", tenant_id AS "tenantId",
        doc_type AS "docType", filename, mime_type AS "mimeType", size_bytes AS "sizeBytes",
        created_at AS "createdAt"
    `

    if (body.tenantId) {
      const docs = await sql`
        SELECT docs_json FROM tenants WHERE id = ${body.tenantId} AND org_id = ${req.orgId!} LIMIT 1
      `
      const current = (docs[0]?.docs_json as Record<string, string>) ?? {}
      const next = { ...current, [body.docType]: body.filename }
      await sql`
        UPDATE tenants
        SET docs_json = ${JSON.stringify(next)}::jsonb, updated_at = now()
        WHERE id = ${body.tenantId} AND org_id = ${req.orgId!}
      `
    }

    res.status(201).json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

documentsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const rows = await sql`
      SELECT id, filename, mime_type AS "mimeType", content_base64 AS "contentBase64",
        size_bytes AS "sizeBytes"
      FROM documents
      WHERE id = ${id} AND org_id = ${req.orgId!}
      LIMIT 1
    `
    if (rows.length === 0) throw new AppError(404, 'Document not found')
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
})

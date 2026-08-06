import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { signAccessToken } from '../lib/auth.js'
import { generateInviteToken, hashInviteToken } from '../lib/inviteToken.js'
import { inviteLink } from '../lib/publicUrl.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../middleware/error.js'

export const invitesRouter = Router()

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['tenant', 'landlord']),
  applicationId: z.string().uuid().optional().nullable(),
  tenantId: z.string().uuid().optional().nullable(),
  landlordId: z.string().uuid().optional().nullable(),
})

invitesRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const auth = req.auth!
    if (auth.role !== 'admin' && auth.role !== 'agent' && auth.role !== 'landlord') {
      throw new AppError(403, 'Only an agent or landlord can create invites')
    }
    const body = createInviteSchema.parse(req.body)
    const email = body.email.trim().toLowerCase()

    if (auth.role === 'landlord') {
      if (body.role !== 'tenant' || !body.applicationId) {
        throw new AppError(403, 'Landlords can only invite applicants for their applications')
      }
      const owned = await sql`
        SELECT a.id
        FROM applications a
        JOIN apartments apt ON apt.id = a.apartment_id
        JOIN landlords l ON l.id = apt.landlord_id
        WHERE a.id = ${body.applicationId}
          AND a.org_id = ${req.orgId!}
          AND l.user_id = ${auth.sub}
        LIMIT 1
      `
      if (owned.length === 0) {
        throw new AppError(403, 'Application not found on your units')
      }
    }

    if (body.applicationId) {
      const apps = await sql`
        SELECT id FROM applications
        WHERE id = ${body.applicationId} AND org_id = ${req.orgId!}
        LIMIT 1
      `
      if (apps.length === 0) throw new AppError(400, 'applicationId not found')
    }
    if (body.tenantId) {
      const t = await sql`
        SELECT id FROM tenants WHERE id = ${body.tenantId} AND org_id = ${req.orgId!} LIMIT 1
      `
      if (t.length === 0) throw new AppError(400, 'tenantId not found')
    }
    if (body.landlordId) {
      const l = await sql`
        SELECT id FROM landlords WHERE id = ${body.landlordId} AND org_id = ${req.orgId!} LIMIT 1
      `
      if (l.length === 0) throw new AppError(400, 'landlordId not found')
    }

    const { token, tokenHash } = generateInviteToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const rows = await sql`
      INSERT INTO invites (
        org_id, email, role, token_hash, expires_at,
        application_id, tenant_id, landlord_id, invited_by
      )
      VALUES (
        ${req.orgId!}, ${email}, ${body.role}, ${tokenHash}, ${expiresAt.toISOString()},
        ${body.applicationId ?? null}, ${body.tenantId ?? null},
        ${body.landlordId ?? null}, ${req.auth!.sub}
      )
      RETURNING id, email, role, expires_at AS "expiresAt", application_id AS "applicationId",
        tenant_id AS "tenantId", landlord_id AS "landlordId", created_at AS "createdAt"
    `

    const url = inviteLink(token)
    console.log(`[invite] ${body.role} ${email} → ${url}`)

    res.status(201).json({
      data: {
        ...rows[0],
        inviteUrl: url,
      },
    })
  } catch (err) {
    next(err)
  }
})

invitesRouter.get('/:token', async (req, res, next) => {
  try {
    const token = z.string().min(16).parse(req.params.token)
    const tokenHash = hashInviteToken(token)
    const rows = await sql`
      SELECT i.id, i.email, i.role, i.expires_at AS "expiresAt", i.accepted_at AS "acceptedAt",
        i.application_id AS "applicationId", o.name AS "orgName",
        COALESCE(a.applicant_name, l.name) AS "fullName"
      FROM invites i
      JOIN organisations o ON o.id = i.org_id
      LEFT JOIN applications a ON a.id = i.application_id
      LEFT JOIN landlords l ON l.id = i.landlord_id
      WHERE i.token_hash = ${tokenHash}
      LIMIT 1
    `
    if (rows.length === 0) throw new AppError(404, 'Invite not found')
    const invite = rows[0]
    if (invite.acceptedAt) throw new AppError(410, 'Invite already accepted')
    if (new Date(String(invite.expiresAt)) < new Date()) {
      throw new AppError(410, 'Invite has expired')
    }
    res.json({
      data: {
        email: invite.email,
        role: invite.role,
        orgName: invite.orgName,
        applicationId: invite.applicationId,
        expiresAt: invite.expiresAt,
        fullName: invite.fullName ?? null,
      },
    })
  } catch (err) {
    next(err)
  }
})

const acceptSchema = z.object({
  token: z.string().min(16),
  fullName: z.string().min(1).max(160),
  password: z.string().min(6).max(120),
})

invitesRouter.post('/accept', async (req, res, next) => {
  try {
    const body = acceptSchema.parse(req.body)
    const tokenHash = hashInviteToken(body.token)

    const rows = await sql`
      SELECT id, org_id, email, role, expires_at, accepted_at,
        application_id, tenant_id, landlord_id
      FROM invites
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `
    if (rows.length === 0) throw new AppError(404, 'Invite not found')
    const invite = rows[0]
    if (invite.accepted_at) throw new AppError(410, 'Invite already accepted')
    if (new Date(String(invite.expires_at)) < new Date()) {
      throw new AppError(410, 'Invite has expired')
    }

    const email = String(invite.email).toLowerCase()
    const passwordHash = await bcrypt.hash(body.password, 10)

    let userId: string
    const existing = await sql`
      SELECT id FROM users WHERE lower(email) = lower(${email}) LIMIT 1
    `
    if (existing.length > 0) {
      userId = String(existing[0].id)
      await sql`
        UPDATE users
        SET full_name = ${body.fullName},
            password_hash = ${passwordHash},
            updated_at = now()
        WHERE id = ${userId}
      `
    } else {
      const created = await sql`
        INSERT INTO users (email, full_name, password_hash)
        VALUES (${email}, ${body.fullName}, ${passwordHash})
        RETURNING id
      `
      userId = String(created[0].id)
    }

    const role = invite.role as 'tenant' | 'landlord'
    let profileId: string | undefined

    if (role === 'tenant') {
      if (invite.tenant_id) {
        await sql`
          UPDATE tenants SET user_id = ${userId}, updated_at = now()
          WHERE id = ${invite.tenant_id} AND org_id = ${invite.org_id}
        `
        profileId = String(invite.tenant_id)
      }
      if (invite.application_id) {
        await sql`
          UPDATE applications
          SET applicant_user_id = ${userId},
              applicant_name = COALESCE(applicant_name, ${body.fullName}),
              updated_at = now()
          WHERE id = ${invite.application_id} AND org_id = ${invite.org_id}
        `
      }
    } else if (role === 'landlord' && invite.landlord_id) {
      await sql`
        UPDATE landlords SET user_id = ${userId}, updated_at = now()
        WHERE id = ${invite.landlord_id} AND org_id = ${invite.org_id}
      `
      profileId = String(invite.landlord_id)
    }

    await sql`
      UPDATE invites SET accepted_at = now() WHERE id = ${invite.id}
    `

    const org = await sql`
      SELECT id, name, slug FROM organisations WHERE id = ${invite.org_id} LIMIT 1
    `

    const token = await signAccessToken({
      sub: userId,
      orgId: String(invite.org_id),
      role,
      email,
      name: body.fullName,
      profileId,
    })

    res.json({
      data: {
        token,
        user: {
          id: userId,
          email,
          name: body.fullName,
          role,
          profileId: profileId ?? null,
          org: {
            id: org[0].id,
            name: org[0].name,
            slug: org[0].slug,
          },
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { signAccessToken, type AuthRole } from '../lib/auth.js'
import { AppError } from '../middleware/error.js'
import { requireAuth } from '../middleware/auth.js'

export const authRouter = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

async function resolvePortalUser(email: string) {
  const staff = await sql`
    SELECT
      u.id,
      u.email,
      u.full_name,
      u.password_hash,
      m.org_id,
      m.role,
      o.name AS org_name,
      o.slug AS org_slug,
      NULL::uuid AS profile_id
    FROM users u
    JOIN org_members m ON m.user_id = u.id
    JOIN organisations o ON o.id = m.org_id
    WHERE lower(u.email) = lower(${email})
    ORDER BY m.created_at ASC
    LIMIT 1
  `
  if (staff.length > 0) return staff[0]

  const tenant = await sql`
    SELECT
      u.id,
      u.email,
      u.full_name,
      u.password_hash,
      t.org_id,
      'tenant'::text AS role,
      o.name AS org_name,
      o.slug AS org_slug,
      t.id AS profile_id
    FROM users u
    JOIN tenants t ON t.user_id = u.id
    JOIN organisations o ON o.id = t.org_id
    WHERE lower(u.email) = lower(${email})
    ORDER BY t.updated_at DESC
    LIMIT 1
  `
  if (tenant.length > 0) return tenant[0]

  const landlord = await sql`
    SELECT
      u.id,
      u.email,
      u.full_name,
      u.password_hash,
      l.org_id,
      'landlord'::text AS role,
      o.name AS org_name,
      o.slug AS org_slug,
      l.id AS profile_id
    FROM users u
    JOIN landlords l ON l.user_id = u.id
    JOIN organisations o ON o.id = l.org_id
    WHERE lower(u.email) = lower(${email})
    ORDER BY l.updated_at DESC
    LIMIT 1
  `
  if (landlord.length > 0) return landlord[0]

  // Applicant mid-application: linked via applications.applicant_user_id
  const applicant = await sql`
    SELECT
      u.id,
      u.email,
      u.full_name,
      u.password_hash,
      a.org_id,
      'tenant'::text AS role,
      o.name AS org_name,
      o.slug AS org_slug,
      NULL::uuid AS profile_id
    FROM users u
    JOIN applications a ON a.applicant_user_id = u.id
    JOIN organisations o ON o.id = a.org_id
    WHERE lower(u.email) = lower(${email})
    ORDER BY a.updated_at DESC
    LIMIT 1
  `
  if (applicant.length > 0) return applicant[0]

  return null
}

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body)
    const user = await resolvePortalUser(body.email)
    if (!user) throw new AppError(401, 'Invalid email or password')

    if (!user.password_hash) {
      throw new AppError(401, 'Password not set for this user')
    }

    const ok = await bcrypt.compare(body.password, String(user.password_hash))
    if (!ok) throw new AppError(401, 'Invalid email or password')

    const role = user.role as AuthRole
    const token = await signAccessToken({
      sub: String(user.id),
      orgId: String(user.org_id),
      role,
      email: String(user.email),
      name: String(user.full_name),
      profileId: user.profile_id ? String(user.profile_id) : undefined,
    })

    res.json({
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.full_name,
          role,
          profileId: user.profile_id ?? null,
          org: {
            id: user.org_id,
            name: user.org_name,
            slug: user.org_slug,
          },
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const auth = req.auth!
    const userRows = await sql`
      SELECT id, email, full_name FROM users WHERE id = ${auth.sub} LIMIT 1
    `
    if (userRows.length === 0) throw new AppError(401, 'Session no longer valid')

    const u = userRows[0]
    let profileId: string | null = auth.profileId ?? null
    let orgId = auth.orgId
    let orgName = ''
    let orgSlug = ''
    let role: AuthRole = auth.role

    if (role === 'admin' || role === 'agent') {
      const rows = await sql`
        SELECT m.role, o.id AS org_id, o.name AS org_name, o.slug AS org_slug
        FROM org_members m
        JOIN organisations o ON o.id = m.org_id
        WHERE m.user_id = ${auth.sub} AND m.org_id = ${auth.orgId}
        LIMIT 1
      `
      if (rows.length === 0) throw new AppError(401, 'Session no longer valid')
      role = rows[0].role as AuthRole
      orgId = String(rows[0].org_id)
      orgName = String(rows[0].org_name)
      orgSlug = String(rows[0].org_slug)
    } else if (role === 'tenant') {
      const t = await sql`
        SELECT t.id, o.id AS org_id, o.name AS org_name, o.slug AS org_slug
        FROM tenants t
        JOIN organisations o ON o.id = t.org_id
        WHERE t.user_id = ${auth.sub}
        ORDER BY t.updated_at DESC
        LIMIT 1
      `
      if (t.length > 0) {
        profileId = String(t[0].id)
        orgId = String(t[0].org_id)
        orgName = String(t[0].org_name)
        orgSlug = String(t[0].org_slug)
      } else {
        const a = await sql`
          SELECT o.id AS org_id, o.name AS org_name, o.slug AS org_slug
          FROM applications a
          JOIN organisations o ON o.id = a.org_id
          WHERE a.applicant_user_id = ${auth.sub}
          ORDER BY a.updated_at DESC
          LIMIT 1
        `
        if (a.length === 0) throw new AppError(401, 'Session no longer valid')
        orgId = String(a[0].org_id)
        orgName = String(a[0].org_name)
        orgSlug = String(a[0].org_slug)
      }
    } else if (role === 'landlord') {
      const l = await sql`
        SELECT l.id, o.id AS org_id, o.name AS org_name, o.slug AS org_slug
        FROM landlords l
        JOIN organisations o ON o.id = l.org_id
        WHERE l.user_id = ${auth.sub}
        ORDER BY l.updated_at DESC
        LIMIT 1
      `
      if (l.length === 0) throw new AppError(401, 'Session no longer valid')
      profileId = String(l[0].id)
      orgId = String(l[0].org_id)
      orgName = String(l[0].org_name)
      orgSlug = String(l[0].org_slug)
    }

    res.json({
      data: {
        id: u.id,
        email: u.email,
        name: u.full_name,
        role,
        profileId,
        org: { id: orgId, name: orgName, slug: orgSlug },
      },
    })
  } catch (err) {
    next(err)
  }
})

import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { sql } from '../db/client.js'
import { signAccessToken } from '../lib/auth.js'
import { AppError } from '../middleware/error.js'
import { requireAuth } from '../middleware/auth.js'

export const authRouter = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body)

    const rows = await sql`
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.password_hash,
        m.org_id,
        m.role,
        o.name AS org_name,
        o.slug AS org_slug
      FROM users u
      JOIN org_members m ON m.user_id = u.id
      JOIN organisations o ON o.id = m.org_id
      WHERE lower(u.email) = lower(${body.email})
      ORDER BY m.created_at ASC
      LIMIT 1
    `

    if (rows.length === 0) throw new AppError(401, 'Invalid email or password')

    const user = rows[0]
    if (!user.password_hash) {
      throw new AppError(401, 'Password not set for this user')
    }

    const ok = await bcrypt.compare(body.password, String(user.password_hash))
    if (!ok) throw new AppError(401, 'Invalid email or password')

    const token = await signAccessToken({
      sub: String(user.id),
      orgId: String(user.org_id),
      role: user.role as 'admin' | 'agent',
      email: String(user.email),
      name: String(user.full_name),
    })

    res.json({
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.full_name,
          role: user.role,
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
    const rows = await sql`
      SELECT
        u.id,
        u.email,
        u.full_name,
        m.role,
        o.id AS org_id,
        o.name AS org_name,
        o.slug AS org_slug
      FROM users u
      JOIN org_members m ON m.user_id = u.id AND m.org_id = ${auth.orgId}
      JOIN organisations o ON o.id = m.org_id
      WHERE u.id = ${auth.sub}
      LIMIT 1
    `
    if (rows.length === 0) throw new AppError(401, 'Session no longer valid')

    const user = rows[0]
    res.json({
      data: {
        id: user.id,
        email: user.email,
        name: user.full_name,
        role: user.role,
        org: {
          id: user.org_id,
          name: user.org_name,
          slug: user.org_slug,
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

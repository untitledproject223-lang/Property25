import type { NextFunction, Request, Response } from 'express'
import { verifyAccessToken, type AuthTokenPayload } from '../lib/auth.js'
import { AppError } from './error.js'

declare global {
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload
      orgId?: string
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization')
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'Missing or invalid Authorization header')
    }

    const token = header.slice('Bearer '.length).trim()
    if (!token) throw new AppError(401, 'Missing bearer token')

    const payload = await verifyAccessToken(token)
    req.auth = payload
    req.orgId = payload.orgId
    next()
  } catch (err) {
    if (err instanceof AppError) return next(err)
    return next(new AppError(401, 'Invalid or expired token'))
  }
}

/** Require JWT auth and a resolved org id from the token. */
export function requireOrg(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth || !req.orgId) {
    return next(new AppError(401, 'Authentication required'))
  }
  next()
}

import type { NextFunction, Request, Response } from 'express'
import { AppError } from './error.js'

/** Require org context from JWT (set by requireAuth). */
export function requireOrg(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth || !req.orgId) {
    return next(new AppError(401, 'Authentication required'))
  }
  next()
}

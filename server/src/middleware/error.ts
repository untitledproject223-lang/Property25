import type { NextFunction, Request, Response } from 'express'

export class AppError extends Error {
  status: number
  details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'Not found'))
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: err.message,
      details: err.details ?? undefined,
    })
  }

  console.error(err)
  return res.status(500).json({ error: 'Internal server error' })
}

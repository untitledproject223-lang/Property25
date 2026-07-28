import { Router } from 'express'
import { pingDatabase } from '../db/client.js'
import { env } from '../config/env.js'

export const healthRouter = Router()

healthRouter.get('/', async (_req, res, next) => {
  try {
    const db = await pingDatabase()
    res.json({
      status: 'ok',
      service: 'property25-api',
      env: env.NODE_ENV,
      database: db,
    })
  } catch (err) {
    next(err)
  }
})

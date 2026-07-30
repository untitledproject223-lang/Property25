import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import { env } from './config/env.js'
import { errorHandler, notFound } from './middleware/error.js'
import { requireAuth } from './middleware/auth.js'
import { authRouter } from './routes/auth.js'
import { healthRouter } from './routes/health.js'
import { orgsRouter } from './routes/orgs.js'
import { buildingsRouter } from './routes/buildings.js'
import { landlordsRouter } from './routes/landlords.js'
import { apartmentsRouter } from './routes/apartments.js'
import { tenantsRouter } from './routes/tenants.js'
import { applicationsRouter } from './routes/applications.js'
import { dashboardRouter } from './routes/dashboard.js'
import { invoicesRouter } from './routes/invoices.js'
import { paymentsRouter } from './routes/payments.js'
import { issuesRouter } from './routes/issues.js'
import { activityRouter } from './routes/activity.js'
import { documentsRouter } from './routes/documents.js'

function isAllowedOrigin(origin: string): boolean {
  if (env.corsOrigins.includes(origin)) return true
  try {
    const host = new URL(origin).hostname
    return host === 'midpointblue.co.za' || host.endsWith('.midpointblue.co.za')
  } catch {
    return false
  }
}

export function createApp() {
  const app = express()

  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || isAllowedOrigin(origin)) {
          callback(null, true)
          return
        }
        callback(new Error(`CORS blocked: ${origin}`))
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  )
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'))
  app.use(express.json({ limit: '8mb' }))

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again later.' },
  })

  app.get('/', (_req, res) => {
    res.json({
      name: 'Property25 API',
      version: '1.1.0',
      docs: {
        health: 'GET /api/health',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me',
        dashboard: 'GET /api/dashboard (Bearer token)',
      },
    })
  })

  app.use('/api/health', healthRouter)
  app.use('/api/auth/login', loginLimiter)
  app.use('/api/auth', authRouter)
  app.use('/api/orgs', requireAuth, orgsRouter)
  app.use('/api/buildings', buildingsRouter)
  app.use('/api/landlords', landlordsRouter)
  app.use('/api/apartments', apartmentsRouter)
  app.use('/api/tenants', tenantsRouter)
  app.use('/api/applications', applicationsRouter)
  app.use('/api/invoices', invoicesRouter)
  app.use('/api/payments', paymentsRouter)
  app.use('/api/issues', issuesRouter)
  app.use('/api/activity', activityRouter)
  app.use('/api/documents', documentsRouter)
  app.use('/api/dashboard', dashboardRouter)

  app.use(notFound)
  app.use(errorHandler)

  return app
}

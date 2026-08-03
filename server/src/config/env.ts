import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../.env') })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (Neon connection string)'),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173,https://midpointblue.co.za'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  APP_PUBLIC_URL: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
}
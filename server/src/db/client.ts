import { neon } from '@neondatabase/serverless'
import { env } from '../config/env.js'

/** Tagged-template SQL client for Neon (HTTP, serverless-friendly). */
export const sql = neon(env.DATABASE_URL)

export async function pingDatabase(): Promise<{ ok: true; now: string }> {
  const rows = await sql`SELECT now() AS now`
  return { ok: true, now: String(rows[0]?.now ?? '') }
}

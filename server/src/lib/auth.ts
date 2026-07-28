import { SignJWT, jwtVerify } from 'jose'
import { env } from '../config/env.js'

export type AuthTokenPayload = {
  sub: string
  orgId: string
  role: 'admin' | 'agent'
  email: string
  name: string
}

const secretKey = () => new TextEncoder().encode(env.JWT_SECRET)

export async function signAccessToken(payload: AuthTokenPayload): Promise<string> {
  return new SignJWT({
    orgId: payload.orgId,
    role: payload.role,
    email: payload.email,
    name: payload.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey())
}

export async function verifyAccessToken(token: string): Promise<AuthTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey())
  const sub = payload.sub
  const orgId = payload.orgId
  const role = payload.role
  const email = payload.email
  const name = payload.name

  if (
    typeof sub !== 'string' ||
    typeof orgId !== 'string' ||
    (role !== 'admin' && role !== 'agent') ||
    typeof email !== 'string' ||
    typeof name !== 'string'
  ) {
    throw new Error('Invalid token payload')
  }

  return { sub, orgId, role, email, name }
}

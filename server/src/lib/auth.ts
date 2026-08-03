import { SignJWT, jwtVerify } from 'jose'
import { env } from '../config/env.js'

export type AuthRole = 'admin' | 'agent' | 'tenant' | 'landlord'

export type AuthTokenPayload = {
  sub: string
  orgId: string
  role: AuthRole
  email: string
  name: string
  /** Linked CRM row for tenant/landlord roles */
  profileId?: string
}

const secretKey = () => new TextEncoder().encode(env.JWT_SECRET)

const ROLES: AuthRole[] = ['admin', 'agent', 'tenant', 'landlord']

export function isAuthRole(value: unknown): value is AuthRole {
  return typeof value === 'string' && (ROLES as string[]).includes(value)
}

export async function signAccessToken(payload: AuthTokenPayload): Promise<string> {
  return new SignJWT({
    orgId: payload.orgId,
    role: payload.role,
    email: payload.email,
    name: payload.name,
    profileId: payload.profileId,
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
  const profileId = payload.profileId

  if (
    typeof sub !== 'string' ||
    typeof orgId !== 'string' ||
    !isAuthRole(role) ||
    typeof email !== 'string' ||
    typeof name !== 'string'
  ) {
    throw new Error('Invalid token payload')
  }

  return {
    sub,
    orgId,
    role,
    email,
    name,
    profileId: typeof profileId === 'string' ? profileId : undefined,
  }
}

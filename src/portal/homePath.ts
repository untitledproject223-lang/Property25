import type { AuthUser } from '../data/api'

export function homePathForRole(user: AuthUser | null | undefined): string {
  if (!user) return '/login'
  if (user.role === 'tenant') return '/tenant'
  if (user.role === 'landlord') return '/landlord'
  return '/'
}

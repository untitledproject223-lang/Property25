const TOKEN_KEY = 'property25_token'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:4000'

export class ApiError extends Error {
  status: number
  details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (!token) localStorage.removeItem(TOKEN_KEY)
  else localStorage.setItem(TOKEN_KEY, token)
}

type RequestOptions = {
  method?: string
  body?: unknown
  auth?: boolean
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options.auth !== false) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, json.error || res.statusText || 'Request failed', json.details)
  }
  return json as T
}

export type AuthUser = {
  id: string
  email: string
  name: string
  role: 'admin' | 'agent'
  org: { id: string; name: string; slug: string }
}

export async function login(email: string, password: string) {
  const result = await apiRequest<{ data: { token: string; user: AuthUser } }>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  })
  setToken(result.data.token)
  return result.data
}

export async function fetchMe() {
  return apiRequest<{ data: AuthUser }>('/api/auth/me')
}

export async function fetchDashboard() {
  return apiRequest<{ data: import('./types').DashboardState }>('/api/dashboard')
}

export async function createBuilding(input: { name: string; address: string }) {
  return apiRequest<{ data: { id: string; name: string; address: string } }>('/api/buildings', {
    method: 'POST',
    body: input,
  })
}

export async function createLandlord(input: {
  name: string
  email: string
  phone: string
  whatsapp?: string
}) {
  return apiRequest<{
    data: { id: string; name: string; email: string; phone: string; whatsapp: string | null }
  }>('/api/landlords', {
    method: 'POST',
    body: input,
  })
}

export async function createApartment(input: {
  buildingId: string
  landlordId: string
  unitNumber: string
  rent: number
  deposit: number
  status?: 'vacant' | 'occupied' | 'notice'
  nextDueDate?: string | null
}) {
  return apiRequest<{ data: Record<string, unknown> }>('/api/apartments', {
    method: 'POST',
    body: input,
  })
}

export async function createTenant(input: {
  apartmentId: string
  name: string
  email: string
  phone: string
  whatsapp?: string
  leaseStart: string
  leaseEnd: string
  status?: 'active' | 'notice' | 'former'
  balance?: number
}) {
  return apiRequest<{ data: Record<string, unknown> }>('/api/tenants', {
    method: 'POST',
    body: input,
  })
}

export { API_BASE }

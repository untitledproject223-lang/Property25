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

export async function updateApartment(
  id: string,
  input: Partial<{
    buildingId: string
    landlordId: string
    unitNumber: string
    rent: number
    deposit: number
    status: 'vacant' | 'occupied' | 'notice'
    nextDueDate: string | null
  }>,
) {
  return apiRequest<{ data: Record<string, unknown> }>(`/api/apartments/${id}`, {
    method: 'PATCH',
    body: input,
  })
}

export async function deleteApartment(id: string) {
  return apiRequest<{ data: { id: string } }>(`/api/apartments/${id}`, { method: 'DELETE' })
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
  moveInInspection?: {
    date: string
    agent: string
    summary: string
    meterElectric?: string
    meterWater?: string
  }
  docs?: Record<string, string>
}) {
  return apiRequest<{ data: Record<string, unknown> }>('/api/tenants', {
    method: 'POST',
    body: input,
  })
}

export async function createInvoice(input: {
  tenantId: string
  dueDate: string
  items: Array<{ type: string; description: string; amount: number }>
  status?: string
  notes?: string
}) {
  return apiRequest<{ data: Record<string, unknown> }>('/api/invoices', {
    method: 'POST',
    body: input,
  })
}

export async function patchInvoice(id: string, input: { status?: string; notes?: string }) {
  return apiRequest<{ data: Record<string, unknown> }>(`/api/invoices/${id}`, {
    method: 'PATCH',
    body: input,
  })
}

export async function createPayment(input: {
  tenantId: string
  date: string
  type: string
  amount: number
  method: string
  status?: string
  proofName?: string
  note?: string
}) {
  return apiRequest<{ data: Record<string, unknown> }>('/api/payments', {
    method: 'POST',
    body: input,
  })
}

export async function createIssue(input: {
  tenantId: string
  subject: string
  severity?: string
  audience?: string
  message?: string
}) {
  return apiRequest<{ data: Record<string, unknown> }>('/api/issues', {
    method: 'POST',
    body: input,
  })
}

export async function patchIssue(
  id: string,
  input: {
    status?: string
    reply?: { author?: string; body: string }
  },
) {
  return apiRequest<{ data: Record<string, unknown> }>(`/api/issues/${id}`, {
    method: 'PATCH',
    body: input,
  })
}

export async function createActivity(input: {
  tenantId?: string
  landlordId?: string
  kind: string
  channel: string
  body: string
}) {
  return apiRequest<{ data: Record<string, unknown> }>('/api/activity', {
    method: 'POST',
    body: input,
  })
}

export async function createApplication(input: {
  apartmentId?: string | null
  applicantName: string
  applicantEmail: string
  applicantPhone?: string
  status?: string
}) {
  return apiRequest<{ data: Record<string, unknown> }>('/api/applications', {
    method: 'POST',
    body: input,
  })
}

export async function patchApplication(
  id: string,
  input: { status?: string; completenessPct?: number },
) {
  return apiRequest<{ data: Record<string, unknown> }>(`/api/applications/${id}`, {
    method: 'PATCH',
    body: input,
  })
}

export async function uploadDocument(input: {
  applicationId?: string | null
  tenantId?: string | null
  docType: string
  filename: string
  mimeType: string
  contentBase64: string
}) {
  return apiRequest<{ data: Record<string, unknown> }>('/api/documents', {
    method: 'POST',
    body: input,
  })
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export { API_BASE }

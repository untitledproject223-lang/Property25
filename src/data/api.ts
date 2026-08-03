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

export type AuthRole = 'admin' | 'agent' | 'tenant' | 'landlord'

export type AuthUser = {
  id: string
  email: string
  name: string
  role: AuthRole
  profileId?: string | null
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
  billingKind?: 'recurring' | 'one_time'
  isRecurring?: boolean
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
  tenantId?: string
  subject: string
  severity?: string
  audience?: string
  issueType?: 'maintenance' | 'general' | 'invoice'
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
    decision?: {
      outcome: 'accept' | 'reject' | 'conditional'
      payer?: 'landlord' | 'tenant' | 'split'
      landlordShare?: number
      tenantShare?: number
      workDescription?: string
      materialsCost?: number
      labourCost?: number
      note?: string
    }
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
  inviteApplicant?: boolean
  formData?: Record<string, unknown>
}) {
  return apiRequest<{
    data: Record<string, unknown> & {
      invite?: { inviteUrl: string; email: string } | null
    }
  }>('/api/applications', {
    method: 'POST',
    body: input,
  })
}

export async function listApplications() {
  return apiRequest<{ data: Array<Record<string, unknown>> }>('/api/applications')
}

export async function fetchApplication(id: string) {
  return apiRequest<{
    data: Record<string, unknown> & {
      formData?: Record<string, unknown>
      completedStages?: string[]
      payloadUpdatedAt?: string | null
    }
  }>(`/api/applications/${id}`)
}

export async function patchApplication(
  id: string,
  input: {
    status?: string
    completenessPct?: number
    formData?: Record<string, unknown>
    completedStages?: string[]
    apartmentId?: string | null
    applicantName?: string
    applicantEmail?: string
    applicantPhone?: string | null
  },
) {
  return apiRequest<{
    data: Record<string, unknown> & {
      formData?: Record<string, unknown>
      completedStages?: string[]
    }
  }>(`/api/applications/${id}`, {
    method: 'PATCH',
    body: input,
  })
}

export async function createInvite(input: {
  email: string
  role: 'tenant' | 'landlord'
  applicationId?: string | null
  tenantId?: string | null
  landlordId?: string | null
}) {
  return apiRequest<{
    data: { id: string; email: string; role: string; inviteUrl: string }
  }>('/api/invites', {
    method: 'POST',
    body: input,
  })
}

export async function fetchInvite(token: string) {
  return apiRequest<{
    data: {
      email: string
      role: string
      orgName: string
      applicationId?: string | null
      expiresAt: string
    }
  }>(`/api/invites/${token}`, { auth: false })
}

export async function acceptInvite(input: {
  token: string
  fullName: string
  password: string
}) {
  const result = await apiRequest<{ data: { token: string; user: AuthUser } }>(
    '/api/invites/accept',
    { method: 'POST', body: input, auth: false },
  )
  setToken(result.data.token)
  return result.data
}

export async function fetchTenantStays() {
  return apiRequest<{ data: Array<Record<string, unknown>> }>('/api/portal/tenant/stays')
}

export async function fetchTenantStay(id: string) {
  return apiRequest<{ data: Record<string, unknown> }>(`/api/portal/tenant/stays/${id}`)
}

export async function fetchTenantProfile() {
  return apiRequest<{ data: Record<string, unknown> }>('/api/portal/tenant/profile')
}

export async function fetchLandlordPortfolio() {
  return apiRequest<{
    data: {
      landlord: Record<string, unknown>
      units: Array<Record<string, unknown>>
    }
  }>('/api/portal/landlord/portfolio')
}

export async function setUnitTicketManager(
  unitId: string,
  ticketManager: 'landlord' | 'agent',
) {
  return apiRequest<{ data: Record<string, unknown> }>(
    `/api/portal/landlord/units/${unitId}/ticket-manager`,
    { method: 'PATCH', body: { ticketManager } },
  )
}

export async function listIssues() {
  return apiRequest<{ data: Array<Record<string, unknown>> }>('/api/issues')
}

export type DocumentMeta = {
  id: string
  applicationId?: string | null
  tenantId?: string | null
  docType: string
  filename: string
  mimeType: string
  sizeBytes: number
  createdAt?: string
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

export async function listDocuments(params: {
  tenantId?: string
  applicationId?: string
  apartmentId?: string
}) {
  const qs = new URLSearchParams()
  if (params.tenantId) qs.set('tenantId', params.tenantId)
  if (params.applicationId) qs.set('applicationId', params.applicationId)
  if (params.apartmentId) qs.set('apartmentId', params.apartmentId)
  return apiRequest<{ data: DocumentMeta[] }>(`/api/documents?${qs.toString()}`)
}

export async function fetchDocument(id: string) {
  return apiRequest<{
    data: {
      id: string
      filename: string
      mimeType: string
      contentBase64: string
      sizeBytes: number
    }
  }>(`/api/documents/${id}`)
}

export async function downloadDocument(id: string) {
  const { data } = await fetchDocument(id)
  const binary = atob(data.contentBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: data.mimeType || 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = data.filename || 'document'
  a.click()
  URL.revokeObjectURL(url)
}

export async function fetchApartmentHistory(apartmentId: string) {
  return apiRequest<{ data: ApartmentHistory }>(`/api/apartments/${apartmentId}/history`)
}

export type ApartmentHistory = {
  apartment: {
    id: string
    buildingId: string
    landlordId: string
    unitNumber: string
    rent: number
    deposit: number
    status: string
    nextDueDate?: string | null
    buildingName: string
    buildingAddress: string
    landlordName: string
    landlordEmail: string
    landlordPhone: string
    landlordWhatsapp?: string | null
  }
  tenants: Array<Record<string, unknown>>
  applications: Array<Record<string, unknown>>
  invoices: Array<Record<string, unknown>>
  payments: Array<Record<string, unknown>>
  issues: Array<Record<string, unknown>>
  documents: DocumentMeta[]
  screening: Array<Record<string, unknown>>
  affordability: Array<Record<string, unknown>>
  income: Array<Record<string, unknown>>
}

export async function saveApplicationScreening(
  applicationId: string,
  input: {
    enquiryType?: string
    status?: 'pending' | 'processing' | 'completed' | 'failed'
    providerRef?: string | null
    summary?: Record<string, unknown>
    affordability?: {
      band: 'green' | 'amber' | 'red'
      score?: number | null
      reasons?: unknown[]
      overrideNote?: string | null
    }
    income?: {
      grossSalary?: number | null
      targetRent?: number | null
      majorExpenses?: unknown[]
    }
    linkTenantId?: string | null
  },
) {
  return apiRequest<{ data: Record<string, unknown> }>(
    `/api/applications/${applicationId}/screening`,
    { method: 'POST', body: input },
  )
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

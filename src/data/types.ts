export type ApartmentStatus = 'vacant' | 'occupied' | 'notice'
export type TenantStatus = 'active' | 'notice' | 'former'
export type PaymentType = 'rent' | 'deposit' | 'admin' | 'other'
export type PaymentMethod = 'eft' | 'card' | 'cash'
export type PaymentStatus = 'paid' | 'pending' | 'failed'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
export type InvoiceItemType = 'rent' | 'deposit' | 'admin' | 'maintenance' | 'other'
export type InvoiceBillingKind = 'recurring' | 'one_time'
export type IssueStatus = 'open' | 'pending' | 'resolved'
export type IssueSeverity = 'low' | 'medium' | 'high'
export type IssueAudience = 'agent' | 'landlord' | 'both'
export type MessageAuthor = 'tenant' | 'agent' | 'landlord'
export type ContactChannel = 'email' | 'whatsapp' | 'phone' | 'note'
export type ActivityKind = 'contact' | 'landlord_update' | 'note'

export interface Building {
  id: string
  name: string
  address: string
}

export interface Landlord {
  id: string
  name: string
  email: string
  phone: string
  whatsapp?: string
}

export interface Apartment {
  id: string
  buildingId: string
  unitNumber: string
  rent: number
  deposit: number
  status: ApartmentStatus
  landlordId: string
  nextDueDate?: string
}

export interface Tenant {
  id: string
  apartmentId: string
  name: string
  email: string
  phone: string
  whatsapp?: string
  leaseStart: string
  leaseEnd: string
  status: TenantStatus
  balance: number
  docs?: {
    leaseFile?: string
    idDoc?: string
    incomeDoc?: string
  }
  moveInInspection?: {
    date: string
    agent: string
    summary: string
    meterElectric?: string
    meterWater?: string
  }
}

export interface Payment {
  id: string
  tenantId: string
  date: string
  type: PaymentType
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  proofName?: string
  note?: string
}

export interface InvoiceItem {
  type: InvoiceItemType
  description: string
  amount: number
}

export interface Invoice {
  id: string
  tenantId: string
  issuedAt: string
  dueDate: string
  items: InvoiceItem[]
  total: number
  status: InvoiceStatus
  notes?: string
  isRecurring?: boolean
  billingKind?: InvoiceBillingKind
}

export interface IssueMessage {
  id: string
  author: MessageAuthor
  body: string
  at: string
}

export interface Issue {
  id: string
  tenantId: string
  subject: string
  status: IssueStatus
  severity: IssueSeverity
  audience: IssueAudience
  createdAt: string
  messages: IssueMessage[]
}

export interface LandlordUpdate {
  id: string
  landlordId: string
  tenantId?: string
  body: string
  at: string
  channel: ContactChannel
}

export interface ActivityLog {
  id: string
  tenantId?: string
  landlordId?: string
  kind: ActivityKind
  channel: ContactChannel
  body: string
  at: string
}

export interface DashboardState {
  buildings: Building[]
  landlords: Landlord[]
  apartments: Apartment[]
  tenants: Tenant[]
  payments: Payment[]
  invoices: Invoice[]
  issues: Issue[]
  landlordUpdates: LandlordUpdate[]
  activityLog: ActivityLog[]
}

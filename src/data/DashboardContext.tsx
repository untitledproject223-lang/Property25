import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { seedData } from './seed'
import type {
  ActivityLog,
  ContactChannel,
  DashboardState,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  IssueMessage,
  IssueStatus,
  LandlordUpdate,
  Payment,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from './types'

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function nowIso() {
  return new Date().toISOString()
}

interface CreateInvoiceInput {
  tenantId: string
  dueDate: string
  items: InvoiceItem[]
  notes?: string
  status?: InvoiceStatus
}

interface AddPaymentInput {
  tenantId: string
  date: string
  type: PaymentType
  amount: number
  method: PaymentMethod
  status?: PaymentStatus
  proofName?: string
  note?: string
}

interface DashboardContextValue {
  state: DashboardState
  createInvoice: (input: CreateInvoiceInput) => Invoice
  updateInvoiceStatus: (invoiceId: string, status: InvoiceStatus) => void
  addPayment: (input: AddPaymentInput) => Payment
  replyToIssue: (issueId: string, body: string, author?: IssueMessage['author']) => void
  setIssueStatus: (issueId: string, status: IssueStatus) => void
  logLandlordUpdate: (input: {
    landlordId: string
    tenantId?: string
    body: string
    channel?: ContactChannel
  }) => LandlordUpdate
  logActivity: (input: {
    tenantId?: string
    landlordId?: string
    kind: ActivityLog['kind']
    channel: ContactChannel
    body: string
  }) => void
  getBuilding: (id: string) => DashboardState['buildings'][0] | undefined
  getApartment: (id: string) => DashboardState['apartments'][0] | undefined
  getLandlord: (id: string) => DashboardState['landlords'][0] | undefined
  getTenant: (id: string) => DashboardState['tenants'][0] | undefined
  tenantApartment: (tenantId: string) => {
    tenant: DashboardState['tenants'][0]
    apartment: DashboardState['apartments'][0]
    building: DashboardState['buildings'][0]
    landlord: DashboardState['landlords'][0]
  } | null
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DashboardState>(seedData)

  const createInvoice = useCallback((input: CreateInvoiceInput) => {
    const total = input.items.reduce((sum, item) => sum + item.amount, 0)
    const invoice: Invoice = {
      id: uid('inv'),
      tenantId: input.tenantId,
      issuedAt: nowIso().slice(0, 10),
      dueDate: input.dueDate,
      items: input.items,
      total,
      status: input.status ?? 'draft',
      notes: input.notes,
    }
    setState((prev) => ({ ...prev, invoices: [invoice, ...prev.invoices] }))
    return invoice
  }, [])

  const updateInvoiceStatus = useCallback((invoiceId: string, status: InvoiceStatus) => {
    setState((prev) => ({
      ...prev,
      invoices: prev.invoices.map((inv) =>
        inv.id === invoiceId ? { ...inv, status } : inv,
      ),
    }))
  }, [])

  const addPayment = useCallback((input: AddPaymentInput) => {
    const payment: Payment = {
      id: uid('pay'),
      tenantId: input.tenantId,
      date: input.date,
      type: input.type,
      amount: input.amount,
      method: input.method,
      status: input.status ?? 'paid',
      proofName: input.proofName,
      note: input.note,
    }
    setState((prev) => {
      const tenants = prev.tenants.map((t) => {
        if (t.id !== input.tenantId) return t
        const nextBalance = Math.max(0, t.balance - (payment.status === 'paid' ? payment.amount : 0))
        return { ...t, balance: nextBalance }
      })
      return { ...prev, payments: [payment, ...prev.payments], tenants }
    })
    return payment
  }, [])

  const replyToIssue = useCallback(
    (issueId: string, body: string, author: IssueMessage['author'] = 'agent') => {
      const message: IssueMessage = {
        id: uid('msg'),
        author,
        body,
        at: nowIso(),
      }
      setState((prev) => ({
        ...prev,
        issues: prev.issues.map((issue) =>
          issue.id === issueId
            ? {
                ...issue,
                status: issue.status === 'resolved' ? issue.status : 'pending',
                messages: [...issue.messages, message],
              }
            : issue,
        ),
      }))
    },
    [],
  )

  const setIssueStatus = useCallback((issueId: string, status: IssueStatus) => {
    setState((prev) => ({
      ...prev,
      issues: prev.issues.map((issue) =>
        issue.id === issueId ? { ...issue, status } : issue,
      ),
    }))
  }, [])

  const logLandlordUpdate = useCallback(
    (input: {
      landlordId: string
      tenantId?: string
      body: string
      channel?: ContactChannel
    }) => {
      const update: LandlordUpdate = {
        id: uid('lu'),
        landlordId: input.landlordId,
        tenantId: input.tenantId,
        body: input.body,
        at: nowIso(),
        channel: input.channel ?? 'email',
      }
      setState((prev) => ({
        ...prev,
        landlordUpdates: [update, ...prev.landlordUpdates],
        activityLog: [
          {
            id: uid('act'),
            tenantId: input.tenantId,
            landlordId: input.landlordId,
            kind: 'landlord_update',
            channel: update.channel,
            body: input.body,
            at: update.at,
          },
          ...prev.activityLog,
        ],
      }))
      return update
    },
    [],
  )

  const logActivity = useCallback(
    (input: {
      tenantId?: string
      landlordId?: string
      kind: ActivityLog['kind']
      channel: ContactChannel
      body: string
    }) => {
      setState((prev) => ({
        ...prev,
        activityLog: [
          {
            id: uid('act'),
            ...input,
            at: nowIso(),
          },
          ...prev.activityLog,
        ],
      }))
    },
    [],
  )

  const getBuilding = useCallback(
    (id: string) => state.buildings.find((b) => b.id === id),
    [state.buildings],
  )
  const getApartment = useCallback(
    (id: string) => state.apartments.find((a) => a.id === id),
    [state.apartments],
  )
  const getLandlord = useCallback(
    (id: string) => state.landlords.find((l) => l.id === id),
    [state.landlords],
  )
  const getTenant = useCallback(
    (id: string) => state.tenants.find((t) => t.id === id),
    [state.tenants],
  )

  const tenantApartment = useCallback(
    (tenantId: string) => {
      const tenant = state.tenants.find((t) => t.id === tenantId)
      if (!tenant) return null
      const apartment = state.apartments.find((a) => a.id === tenant.apartmentId)
      if (!apartment) return null
      const building = state.buildings.find((b) => b.id === apartment.buildingId)
      const landlord = state.landlords.find((l) => l.id === apartment.landlordId)
      if (!building || !landlord) return null
      return { tenant, apartment, building, landlord }
    },
    [state],
  )

  const value = useMemo(
    () => ({
      state,
      createInvoice,
      updateInvoiceStatus,
      addPayment,
      replyToIssue,
      setIssueStatus,
      logLandlordUpdate,
      logActivity,
      getBuilding,
      getApartment,
      getLandlord,
      getTenant,
      tenantApartment,
    }),
    [
      state,
      createInvoice,
      updateInvoiceStatus,
      addPayment,
      replyToIssue,
      setIssueStatus,
      logLandlordUpdate,
      logActivity,
      getBuilding,
      getApartment,
      getLandlord,
      getTenant,
      tenantApartment,
    ],
  )

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard() {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider')
  return ctx
}

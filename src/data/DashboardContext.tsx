import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  createApartment,
  createBuilding,
  createLandlord,
  createTenant,
  fetchDashboard,
} from './api'
import { useAuth } from './AuthContext'
import { seedData } from './seed'
import type {
  ActivityLog,
  Apartment,
  Building,
  ContactChannel,
  DashboardState,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  IssueMessage,
  IssueStatus,
  Landlord,
  LandlordUpdate,
  Payment,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  Tenant,
} from './types'
import { isUnitVacant } from './unitHelpers'

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function nowIso() {
  return new Date().toISOString()
}

function emptyState(): DashboardState {
  return {
    buildings: [],
    landlords: [],
    apartments: [],
    tenants: [],
    payments: [],
    invoices: [],
    issues: [],
    landlordUpdates: [],
    activityLog: [],
  }
}

function normalizeDashboard(raw: DashboardState): DashboardState {
  return {
    buildings: raw.buildings ?? [],
    landlords: raw.landlords ?? [],
    apartments: (raw.apartments ?? []).map((a) => ({
      ...a,
      rent: Number(a.rent),
      deposit: Number(a.deposit),
      nextDueDate: a.nextDueDate ? String(a.nextDueDate).slice(0, 10) : undefined,
    })),
    tenants: (raw.tenants ?? []).map((t) => ({
      ...t,
      balance: Number(t.balance),
      leaseStart: String(t.leaseStart).slice(0, 10),
      leaseEnd: String(t.leaseEnd).slice(0, 10),
      docs: t.docs ?? undefined,
      moveInInspection: t.moveInInspection ?? undefined,
    })),
    payments: (raw.payments ?? []).map((p) => ({
      ...p,
      amount: Number(p.amount),
      date: String(p.date).slice(0, 10),
    })),
    invoices: (raw.invoices ?? []).map((inv) => ({
      ...inv,
      total: Number(inv.total),
      issuedAt: String(inv.issuedAt).slice(0, 10),
      dueDate: String(inv.dueDate).slice(0, 10),
      items: inv.items ?? [],
    })),
    issues: (raw.issues ?? []).map((issue) => ({
      ...issue,
      createdAt: String(issue.createdAt),
      messages: issue.messages ?? [],
    })),
    landlordUpdates: raw.landlordUpdates ?? [],
    activityLog: (raw.activityLog ?? []).map((a) => ({
      ...a,
      at: String(a.at),
    })),
  }
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

export interface UnitInput {
  buildingId: string
  unitNumber: string
  rent: number
  deposit: number
  landlordId: string
  status?: Apartment['status']
  nextDueDate?: string
}

export interface BuildingInput {
  name: string
  address: string
}

export interface LandlordInput {
  name: string
  email: string
  phone: string
  whatsapp?: string
}

export interface CompleteApplicationInput {
  apartmentId: string
  name: string
  email: string
  phone: string
  whatsapp?: string
  leaseStart: string
  leaseEnd: string
  agentName?: string
  moveInSummary?: string
}

interface DashboardContextValue {
  state: DashboardState
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
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
  addBuilding: (input: BuildingInput) => Promise<Building>
  addLandlord: (input: LandlordInput) => Promise<Landlord>
  addUnit: (input: UnitInput) => Promise<Apartment>
  updateUnit: (id: string, input: Partial<UnitInput>) => void
  deleteUnit: (id: string) => { ok: boolean; error?: string }
  completeApplication: (input: CompleteApplicationInput) => Promise<Tenant | null>
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
  const { user } = useAuth()
  const [state, setState] = useState<DashboardState>(emptyState())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setState(emptyState())
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await fetchDashboard()
      setState(normalizeDashboard(result.data))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      // Fallback so the meeting demo still has something to show if API hiccups
      setState(normalizeDashboard(seedData))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

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

  const addBuilding = useCallback(
    async (input: BuildingInput) => {
      const result = await createBuilding({
        name: input.name.trim(),
        address: input.address.trim(),
      })
      await refresh()
      return {
        id: String(result.data.id),
        name: String(result.data.name),
        address: String(result.data.address),
      }
    },
    [refresh],
  )

  const addLandlord = useCallback(
    async (input: LandlordInput) => {
      const phone = input.phone.trim()
      const result = await createLandlord({
        name: input.name.trim(),
        email: input.email.trim(),
        phone,
        whatsapp: input.whatsapp?.trim() || phone.replace(/\D/g, '') || undefined,
      })
      await refresh()
      return {
        id: String(result.data.id),
        name: String(result.data.name),
        email: String(result.data.email),
        phone: String(result.data.phone),
        whatsapp: result.data.whatsapp ?? undefined,
      }
    },
    [refresh],
  )

  const addUnit = useCallback(
    async (input: UnitInput) => {
      const result = await createApartment({
        buildingId: input.buildingId,
        landlordId: input.landlordId,
        unitNumber: input.unitNumber.trim(),
        rent: input.rent,
        deposit: input.deposit,
        status: input.status ?? 'vacant',
        nextDueDate: input.nextDueDate ?? null,
      })
      await refresh()
      const row = result.data
      return {
        id: String(row.id),
        buildingId: String(row.building_id ?? input.buildingId),
        unitNumber: String(row.unit_number ?? input.unitNumber),
        rent: Number(row.rent ?? input.rent),
        deposit: Number(row.deposit ?? input.deposit),
        landlordId: String(row.landlord_id ?? input.landlordId),
        status: (row.status as Apartment['status']) ?? input.status ?? 'vacant',
        nextDueDate: input.nextDueDate,
      }
    },
    [refresh],
  )

  const updateUnit = useCallback((id: string, input: Partial<UnitInput>) => {
    setState((prev) => ({
      ...prev,
      apartments: prev.apartments.map((a) => {
        if (a.id !== id) return a
        return {
          ...a,
          buildingId: input.buildingId ?? a.buildingId,
          unitNumber: input.unitNumber?.trim() ?? a.unitNumber,
          rent: input.rent ?? a.rent,
          deposit: input.deposit ?? a.deposit,
          landlordId: input.landlordId ?? a.landlordId,
          status: input.status ?? a.status,
          nextDueDate:
            input.nextDueDate !== undefined ? input.nextDueDate : a.nextDueDate,
        }
      }),
    }))
  }, [])

  const deleteUnit = useCallback((id: string) => {
    let blocked = false
    setState((prev) => {
      if (!isUnitVacant(id, prev.tenants)) {
        blocked = true
        return prev
      }
      return {
        ...prev,
        apartments: prev.apartments.filter((a) => a.id !== id),
      }
    })
    return blocked
      ? { ok: false, error: 'Only vacant (unassigned) units can be deleted.' }
      : { ok: true }
  }, [])

  const completeApplication = useCallback(
    async (input: CompleteApplicationInput): Promise<Tenant | null> => {
      if (!isUnitVacant(input.apartmentId, state.tenants)) return null
      const apartment = state.apartments.find((a) => a.id === input.apartmentId)
      if (!apartment) return null

      const result = await createTenant({
        apartmentId: input.apartmentId,
        name: input.name.trim() || 'New tenant',
        email: input.email.trim() || 'tenant@example.com',
        phone: input.phone.trim() || '',
        whatsapp: input.whatsapp,
        leaseStart: input.leaseStart || nowIso().slice(0, 10),
        leaseEnd: input.leaseEnd || nowIso().slice(0, 10),
        status: 'active',
        balance: 0,
      })
      await refresh()
      const row = result.data
      return {
        id: String(row.id),
        apartmentId: String(row.apartment_id ?? input.apartmentId),
        name: String(row.name),
        email: String(row.email),
        phone: String(row.phone),
        whatsapp: (row.whatsapp as string | undefined) ?? undefined,
        leaseStart: String(row.lease_start ?? input.leaseStart).slice(0, 10),
        leaseEnd: String(row.lease_end ?? input.leaseEnd).slice(0, 10),
        status: 'active',
        balance: 0,
        moveInInspection: input.moveInSummary
          ? {
              date: nowIso().slice(0, 10),
              agent: input.agentName || 'Agent',
              summary: input.moveInSummary,
            }
          : undefined,
      }
    },
    [refresh, state.apartments, state.tenants],
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
      loading,
      error,
      refresh,
      createInvoice,
      updateInvoiceStatus,
      addPayment,
      replyToIssue,
      setIssueStatus,
      logLandlordUpdate,
      logActivity,
      addBuilding,
      addLandlord,
      addUnit,
      updateUnit,
      deleteUnit,
      completeApplication,
      getBuilding,
      getApartment,
      getLandlord,
      getTenant,
      tenantApartment,
    }),
    [
      state,
      loading,
      error,
      refresh,
      createInvoice,
      updateInvoiceStatus,
      addPayment,
      replyToIssue,
      setIssueStatus,
      logLandlordUpdate,
      logActivity,
      addBuilding,
      addLandlord,
      addUnit,
      updateUnit,
      deleteUnit,
      completeApplication,
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

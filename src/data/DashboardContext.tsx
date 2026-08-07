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
  createActivity,
  createApartment,
  createBuilding,
  createInvoice as apiCreateInvoice,
  createLandlord,
  createPayment,
  createTenant,
  deleteApartment,
  fetchDashboard,
  patchInvoice,
  patchIssue,
  updateApartment,
} from './api'
import { useAuth } from './AuthContext'
import type {
  ActivityLog,
  Apartment,
  Building,
  ContactChannel,
  DashboardState,
  Invoice,
  InvoiceBillingKind,
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
      depositBalance:
        a.depositBalance != null ? Number(a.depositBalance) : Number(a.deposit),
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
      isRecurring: Boolean(inv.isRecurring ?? inv.billingKind === 'recurring'),
      billingKind:
        (inv.billingKind as InvoiceBillingKind | undefined) ??
        (inv.isRecurring ? 'recurring' : 'one_time'),
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
  billingKind?: InvoiceBillingKind
  isRecurring?: boolean
  issueId?: string
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
  postalCode?: string | null
  levies?: number | null
  municipal?: number | null
  purchasePrice?: number | null
  bankOwed?: number | null
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
  applicationId?: string
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
  createInvoice: (input: CreateInvoiceInput) => Promise<Invoice>
  updateInvoiceStatus: (invoiceId: string, status: InvoiceStatus) => Promise<void>
  addPayment: (input: AddPaymentInput) => Promise<Payment>
  replyToIssue: (issueId: string, body: string, author?: IssueMessage['author']) => Promise<void>
  setIssueStatus: (issueId: string, status: IssueStatus) => Promise<void>
  logLandlordUpdate: (input: {
    landlordId: string
    tenantId?: string
    body: string
    channel?: ContactChannel
  }) => Promise<LandlordUpdate>
  logActivity: (input: {
    tenantId?: string
    landlordId?: string
    kind: ActivityLog['kind']
    channel: ContactChannel
    body: string
  }) => Promise<void>
  addBuilding: (input: BuildingInput) => Promise<Building>
  addLandlord: (input: LandlordInput) => Promise<Landlord>
  addUnit: (input: UnitInput) => Promise<Apartment>
  updateUnit: (id: string, input: Partial<UnitInput>) => Promise<void>
  deleteUnit: (id: string) => Promise<{ ok: boolean; error?: string }>
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
    // Agent desk data only — tenant/landlord portals use /api/portal
    if (user.role !== 'admin' && user.role !== 'agent') {
      setState(emptyState())
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await fetchDashboard()
      setState(normalizeDashboard(result.data))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      setState(emptyState())
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
    const onFocus = () => {
      if (user?.role === 'admin' || user?.role === 'agent') void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh, user?.role])

  const createInvoice = useCallback(
    async (input: CreateInvoiceInput) => {
      const billingKind =
        input.billingKind ?? (input.isRecurring ? 'recurring' : 'one_time')
      const result = await apiCreateInvoice({
        tenantId: input.tenantId,
        dueDate: input.dueDate,
        items: input.items,
        status: input.status ?? 'sent',
        notes: input.notes,
        billingKind,
        isRecurring: billingKind === 'recurring',
        issueId: input.issueId,
      })
      await refresh()
      const row = result.data
      return {
        id: String(row.id),
        tenantId: String(row.tenantId ?? input.tenantId),
        issuedAt: String(row.issuedAt ?? nowIso().slice(0, 10)).slice(0, 10),
        dueDate: String(row.dueDate ?? input.dueDate).slice(0, 10),
        items: (row.items as InvoiceItem[]) ?? input.items,
        total: Number(row.total ?? 0),
        status: (row.status as InvoiceStatus) ?? input.status ?? 'sent',
        notes: (row.notes as string | undefined) ?? input.notes,
        isRecurring: Boolean(row.isRecurring ?? billingKind === 'recurring'),
        billingKind:
          (row.billingKind as InvoiceBillingKind | undefined) ?? billingKind,
        issueId: (row.issueId as string | null | undefined) ?? input.issueId ?? null,
      }
    },
    [refresh],
  )

  const updateInvoiceStatus = useCallback(
    async (invoiceId: string, status: InvoiceStatus) => {
      await patchInvoice(invoiceId, { status })
      await refresh()
    },
    [refresh],
  )

  const addPayment = useCallback(
    async (input: AddPaymentInput) => {
      const result = await createPayment({
        tenantId: input.tenantId,
        date: input.date,
        type: input.type,
        amount: input.amount,
        method: input.method,
        status: input.status ?? 'paid',
        proofName: input.proofName,
        note: input.note,
      })
      await refresh()
      const row = result.data
      return {
        id: String(row.id),
        tenantId: String(row.tenantId ?? input.tenantId),
        date: String(row.date ?? input.date).slice(0, 10),
        type: (row.type as Payment['type']) ?? input.type,
        amount: Number(row.amount ?? input.amount),
        method: (row.method as Payment['method']) ?? input.method,
        status: (row.status as Payment['status']) ?? input.status ?? 'paid',
        proofName: (row.proofName as string | undefined) ?? input.proofName,
        note: (row.note as string | undefined) ?? input.note,
      }
    },
    [refresh],
  )

  const replyToIssue = useCallback(
    async (issueId: string, body: string, author: IssueMessage['author'] = 'agent') => {
      await patchIssue(issueId, { reply: { author, body } })
      await refresh()
    },
    [refresh],
  )

  const setIssueStatus = useCallback(
    async (issueId: string, status: IssueStatus) => {
      await patchIssue(issueId, { status })
      await refresh()
    },
    [refresh],
  )

  const logLandlordUpdate = useCallback(
    async (input: {
      landlordId: string
      tenantId?: string
      body: string
      channel?: ContactChannel
    }) => {
      const result = await createActivity({
        landlordId: input.landlordId,
        tenantId: input.tenantId,
        kind: 'landlord_update',
        channel: input.channel ?? 'email',
        body: input.body,
      })
      await refresh()
      return {
        id: String(result.data.id),
        landlordId: input.landlordId,
        tenantId: input.tenantId,
        body: input.body,
        at: String(result.data.at ?? nowIso()),
        channel: input.channel ?? 'email',
      }
    },
    [refresh],
  )

  const logActivity = useCallback(
    async (input: {
      tenantId?: string
      landlordId?: string
      kind: ActivityLog['kind']
      channel: ContactChannel
      body: string
    }) => {
      await createActivity(input)
      await refresh()
    },
    [refresh],
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
        postalCode: input.postalCode ?? null,
        levies: input.levies ?? null,
        municipal: input.municipal ?? null,
        purchasePrice: input.purchasePrice ?? null,
        bankOwed: input.bankOwed ?? null,
      })
      await refresh()
      const row = result.data
      return {
        id: String(row.id),
        buildingId: String(row.building_id ?? input.buildingId),
        unitNumber: String(row.unit_number ?? input.unitNumber),
        rent: Number(row.rent ?? input.rent),
        deposit: Number(row.deposit ?? input.deposit),
        depositBalance: Number(
          row.deposit_balance ?? row.depositBalance ?? input.deposit,
        ),
        landlordId: String(row.landlord_id ?? input.landlordId),
        status: (row.status as Apartment['status']) ?? input.status ?? 'vacant',
        nextDueDate: input.nextDueDate,
      }
    },
    [refresh],
  )

  const updateUnit = useCallback(
    async (id: string, input: Partial<UnitInput>) => {
      await updateApartment(id, {
        buildingId: input.buildingId,
        landlordId: input.landlordId,
        unitNumber: input.unitNumber?.trim(),
        rent: input.rent,
        deposit: input.deposit,
        status: input.status,
        nextDueDate: input.nextDueDate === undefined ? undefined : input.nextDueDate || null,
      })
      await refresh()
    },
    [refresh],
  )

  const deleteUnit = useCallback(
    async (id: string) => {
      if (!isUnitVacant(id, state.tenants)) {
        return { ok: false, error: 'Only vacant (unassigned) units can be deleted.' }
      }
      try {
        await deleteApartment(id)
        await refresh()
        return { ok: true }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to delete unit',
        }
      }
    },
    [refresh, state.tenants],
  )

  const completeApplication = useCallback(
    async (input: CompleteApplicationInput): Promise<Tenant | null> => {
      if (!isUnitVacant(input.apartmentId, state.tenants)) return null
      const apartment = state.apartments.find((a) => a.id === input.apartmentId)
      if (!apartment) return null

      const result = await createTenant({
        apartmentId: input.apartmentId,
        applicationId: input.applicationId,
        name: input.name.trim() || 'New tenant',
        email: input.email.trim() || 'tenant@example.com',
        phone: input.phone.trim() || '0000000000',
        whatsapp: input.whatsapp,
        leaseStart: input.leaseStart || nowIso().slice(0, 10),
        leaseEnd: input.leaseEnd || nowIso().slice(0, 10),
        status: 'active',
        balance: 0,
        moveInInspection: input.moveInSummary
          ? {
              date: nowIso().slice(0, 10),
              agent: input.agentName || 'Agent',
              summary: input.moveInSummary,
            }
          : undefined,
      })
      await refresh()
      const row = result.data
      return {
        id: String(row.id),
        apartmentId: String(row.apartment_id ?? row.apartmentId ?? input.apartmentId),
        name: String(row.name),
        email: String(row.email),
        phone: String(row.phone),
        whatsapp: (row.whatsapp as string | undefined) ?? undefined,
        leaseStart: String(row.lease_start ?? row.leaseStart ?? input.leaseStart).slice(0, 10),
        leaseEnd: String(row.lease_end ?? row.leaseEnd ?? input.leaseEnd).slice(0, 10),
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

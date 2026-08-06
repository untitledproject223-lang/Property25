import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { PortalRole, StageId } from '../stages'
import {
  STAGES,
  activeStageIndex,
  canEditStage,
  formatPartyList,
  isLandlordInitiated,
  isStageFullyComplete,
  isStageReachable,
  markPartyAdvanced,
  partyHasAdvanced,
  partyHasSigned,
  pendingAdvanceForStage,
  progressHolders,
} from '../stages'
import { Timeline } from '../components/Timeline'
import { StagePanel } from '../components/StagePanel'
import { useAuth } from '../data/AuthContext'
import { useDashboard } from '../data/DashboardContext'
import {
  createApplication,
  createInvite,
  createTenant,
  fetchApplication,
  patchApplication,
  saveApplicationScreening,
} from '../data/api'
import { homePathForRole } from '../portal/homePath'
import '../App.css'

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function isDoneFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

/** Flags that must sync live across tenant / landlord / agent on shared steps. */
const SHARED_SYNC_KEYS = [
  'signApplicantDone',
  'signLandlordDone',
  'signAgentDone',
  'inspectionTenantSigned',
  'inspectionLandlordSigned',
  'inspectionAgentSigned',
  'leaseNextTenant',
  'leaseNextLandlord',
  'leaseNextAgent',
  'moveinNextTenant',
  'moveinNextLandlord',
  'moveinNextAgent',
] as const

type SharedSyncKey = (typeof SHARED_SYNC_KEYS)[number]

function isSharedSyncKey(key: string): key is SharedSyncKey {
  return (SHARED_SYNC_KEYS as readonly string[]).includes(key)
}

function mergeSharedFlags(
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...local, ...remote }
  for (const key of SHARED_SYNC_KEYS) {
    merged[key] = isDoneFlag(local[key]) || isDoneFlag(remote[key])
  }
  return merged
}

const STAGE_STATUS: Record<StageId, string> = {
  inquiry: 'in_progress',
  documents: 'in_progress',
  kycFees: 'in_progress',
  kyc: 'under_review',
  payment: 'awaiting_signature',
  lease: 'awaiting_signature',
  movein: 'tenant',
  success: 'tenant',
}

function agentFieldsFromUser(user: {
  name: string
  email: string
  org: { name: string }
} | null | undefined): Record<string, string> {
  if (!user) {
    return {
      agentName: '',
      agency: '',
      agentEmail: '',
      agentPhone: '',
    }
  }
  return {
    agentName: user.name,
    agency: user.org.name,
    agentEmail: user.email,
    agentPhone: '',
  }
}

function createInitialFormData(
  user?: { name: string; email: string; org: { name: string } } | null,
): Record<string, unknown> {
  return { ...agentFieldsFromUser(user) }
}

function roleCanAct(waitingOn: PortalRole[], role: PortalRole | undefined): boolean {
  if (!role) return false
  if (role === 'admin') return waitingOn.includes('agent') || waitingOn.includes('admin')
  return waitingOn.includes(role)
}

export default function ApplicationPage() {
  const { id: routeId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAgent = user?.role === 'admin' || user?.role === 'agent'
  const isLandlord = user?.role === 'landlord'
  const canStartApplication = isAgent || isLandlord
  const { completeApplication } = useDashboard()

  const [currentIndex, setCurrentIndex] = useState(0)
  const [completed, setCompleted] = useState<Set<StageId>>(new Set())
  const [formData, setFormData] = useState<Record<string, unknown>>(() =>
    createInitialFormData(),
  )
  const [assignedTenantId, setAssignedTenantId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(Boolean(routeId))
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteCopied, setInviteCopied] = useState(false)

  // Prefill locked agent fields from the signed-in agent for new applications
  useEffect(() => {
    if (routeId) return
    if (!user) return
    if (user.role === 'landlord') {
      setFormData((prev) => {
        if (asString(prev.applicationId)) return prev
        return {
          ...prev,
          initiatedBy: 'landlord',
          agentName: '',
          agency: '',
          agentEmail: '',
          agentPhone: '',
        }
      })
      return
    }
    if (user.role !== 'admin' && user.role !== 'agent') return
    const seeded = agentFieldsFromUser(user)
    setFormData((prev) => {
      if (asString(prev.applicationId)) return prev
      return {
        ...prev,
        initiatedBy: 'agent',
        agentName: seeded.agentName,
        agency: seeded.agency,
        agentEmail: seeded.agentEmail,
        agentPhone: asString(prev.agentPhone) || seeded.agentPhone,
      }
    })
  }, [user, routeId])

  const currentStage = STAGES[currentIndex]
  const isLast = currentIndex === STAGES.length - 1
  const activeIndex = useMemo(
    () => activeStageIndex(completed, formData),
    [completed, formData],
  )
  const holders = useMemo(
    () => progressHolders(completed, formData),
    [completed, formData],
  )
  const allComplete = STAGES.every((s) =>
    isStageFullyComplete(s.id, completed, formData),
  )

  const isActiveStep = currentIndex === activeIndex && !allComplete
  const stageComplete = isStageFullyComplete(currentStage.id, completed, formData)
  const canEdit = canEditStage(currentStage.id, user?.role, formData)
  const waitingOn = holders && isActiveStep ? holders.waitingOn : []
  const iAmWaitingParty = roleCanAct(waitingOn, user?.role)
  const isSharedStep = currentStage.id === 'lease' || currentStage.id === 'movein'
  const sharedStageId = isSharedStep
    ? (currentStage.id as 'lease' | 'movein')
    : null
  const advancePending = isSharedStep
    ? pendingAdvanceForStage(currentStage.id, formData)
    : []
  const iHaveAdvanced =
    Boolean(sharedStageId) && partyHasAdvanced(sharedStageId!, formData, user?.role)
  const landlordLed = isLandlordInitiated(formData)

  const mode: 'edit' | 'view' | 'waiting' | 'observing' =
    currentStage.id === 'success'
      ? 'view'
      : stageComplete
        ? 'view'
        : isActiveStep
          ? isSharedStep
            ? !canEdit
              ? 'waiting'
              : // Agent stays on lease to manage the PDF (not part of Next unlock).
                currentStage.id === 'lease' &&
                  (user?.role === 'admin' || user?.role === 'agent')
                ? 'edit'
                : // Tenant / landlord stay on move-in to acknowledge.
                  currentStage.id === 'movein' &&
                    (user?.role === 'tenant' || user?.role === 'landlord')
                  ? 'edit'
                  : iHaveAdvanced
                    ? 'observing'
                    : 'edit'
            : canEdit && iAmWaitingParty
              ? 'edit'
              : 'waiting'
          : 'view'

  const isSuccessStep = currentStage.id === 'success'

  const editable = mode === 'edit'
  const modeRef = useRef(mode)
  const stageIdRef = useRef(currentStage.id)
  const formDataRef = useRef(formData)
  modeRef.current = mode
  stageIdRef.current = currentStage.id
  formDataRef.current = formData

  // Sync progress across parties: single-party steps unlock the next step for everyone;
  // shared steps (lease / move-in) sync signatures until required parties are done.
  useEffect(() => {
    const applicationId = asString(formData.applicationId) || routeId
    if (!applicationId) return

    let cancelled = false

    async function refreshProgress() {
      try {
        const result = await fetchApplication(applicationId!)
        if (cancelled) return
        const remoteForm = (result.data.formData ?? {}) as Record<string, unknown>
        const stages = (result.data.completedStages ?? []) as string[]
        const remoteCompleted = new Set(stages.filter(Boolean) as StageId[])
        const currentMode = modeRef.current
        const stageId = stageIdRef.current
        const pullingForm =
          currentMode === 'waiting' ||
          currentMode === 'observing' ||
          stageId === 'lease' ||
          stageId === 'movein'

        const prevForm = formDataRef.current
        const mergedForActive = mergeSharedFlags(
          { ...prevForm, applicationId },
          remoteForm,
        )

        if (pullingForm) {
          setFormData(mergedForActive)
        }

        // Shared steps complete when required parties have clicked Next
        if (
          (stageId === 'lease' || stageId === 'movein') &&
          pendingAdvanceForStage(stageId, mergedForActive).length === 0
        ) {
          remoteCompleted.add(stageId)
        }

        setCompleted(remoteCompleted)
        // Do not auto-advance the visible step. Each party clicks Next to move forward.
      } catch {
        // ignore transient poll errors
      }
    }

    void refreshProgress()
    // Shared signature steps need faster refresh so parties see each other's confirms.
    const intervalMs =
      stageIdRef.current === 'lease' || stageIdRef.current === 'movein' ? 2000 : 4000
    const timer = window.setInterval(() => void refreshProgress(), intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [routeId, formData.applicationId, user?.role, currentStage.id])

  // When required parties have clicked Next, mark the shared stage completed
  useEffect(() => {
    if (!isSharedStep) return
    if (advancePending.length > 0) return
    if (completed.has(currentStage.id)) return
    setCompleted((prev) => new Set(prev).add(currentStage.id))
  }, [isSharedStep, advancePending.length, completed, currentStage.id])

  useEffect(() => {
    if (!routeId) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchApplication(routeId!)
        if (cancelled) return
        const data = result.data
        const form = (data.formData ?? {}) as Record<string, unknown>
        const stages = (data.completedStages ?? []) as string[]
        const nextForm = {
          ...createInitialFormData(user),
          ...form,
          applicationId: String(data.id),
          applicantName: form.applicantName ?? data.applicant_name ?? data.applicantName,
          applicantEmail: form.applicantEmail ?? data.applicant_email ?? data.applicantEmail,
          applicantPhone: form.applicantPhone ?? data.applicant_phone ?? data.applicantPhone,
          apartmentId: form.apartmentId ?? data.apartment_id ?? data.apartmentId,
        }
        const validIds = new Set(STAGES.map((s) => s.id))
        const nextCompleted = new Set(
          stages.filter((s): s is StageId => validIds.has(s as StageId)),
        )
        setFormData(nextForm)
        setCompleted(nextCompleted)
        setCurrentIndex(activeStageIndex(nextCompleted, nextForm))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load application')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [routeId])

  const sharedSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const completedRef = useRef(completed)
  completedRef.current = completed

  async function persistSharedFlags(snapshot: Record<string, unknown>) {
    const applicationId = asString(snapshot.applicationId) || routeId
    if (!applicationId) return
    try {
      const saved = await patchApplication(applicationId, {
        status: STAGE_STATUS[stageIdRef.current] ?? 'in_progress',
        formData: snapshot,
        completedStages: Array.from(completedRef.current),
        ...(isAgent || isLandlord
          ? {
              apartmentId: asString(snapshot.apartmentId) || null,
              applicantName: asString(snapshot.applicantName) || undefined,
              applicantEmail: asString(snapshot.applicantEmail) || undefined,
            }
          : {}),
        applicantPhone: asString(snapshot.applicantPhone) || null,
      })
      const remoteForm = (saved.data.formData ?? {}) as Record<string, unknown>
      setFormData((prev) =>
        mergeSharedFlags({ ...prev, ...snapshot, applicationId }, remoteForm),
      )
      if (Array.isArray(saved.data.completedStages)) {
        setCompleted(new Set(saved.data.completedStages as StageId[]))
      }
    } catch {
      // Keep local checkbox state; next poll/save can retry.
    }
  }

  function updateField(key: string, value: unknown) {
    if (!editable) return
    setFormData((prev) => {
      const next = { ...prev, [key]: value }
      formDataRef.current = next
      if (isSharedSyncKey(key)) {
        if (sharedSaveTimer.current) window.clearTimeout(sharedSaveTimer.current)
        sharedSaveTimer.current = window.setTimeout(() => {
          void persistSharedFlags(formDataRef.current)
        }, 200)
      }
      return next
    })
  }

  async function ensureApplication(data: Record<string, unknown>) {
    const existing = asString(data.applicationId)
    if (existing) return existing

    if (!canStartApplication) {
      throw new Error('Only an agent or landlord can start a new application.')
    }

    const name = asString(data.applicantName).trim()
    const email = asString(data.applicantEmail).trim()
    const phone = asString(data.applicantPhone).trim()
    if (!name || !email) {
      throw new Error('Applicant name and email are required before continuing.')
    }

    const apartmentId = asString(data.apartmentId) || null
    if (!apartmentId) {
      throw new Error('Select a unit before starting the application.')
    }
    const result = await createApplication({
      apartmentId,
      applicantName: name,
      applicantEmail: email,
      applicantPhone: phone || undefined,
      status: 'in_progress',
      inviteApplicant: true,
      formData: {
        ...data,
        initiatedBy: isLandlord ? 'landlord' : asString(data.initiatedBy) || 'agent',
      },
    })
    const id = String(result.data.id)
    if (result.data.invite?.inviteUrl) {
      setInviteUrl(result.data.invite.inviteUrl)
    }
    setFormData((prev) => ({
      ...prev,
      applicationId: id,
      initiatedBy: isLandlord ? 'landlord' : asString(prev.initiatedBy) || 'agent',
    }))
    navigate(`/apply/${id}`, { replace: true })
    return id
  }

  function validateCurrentStage(): string | null {
    if (!editable) {
      return holders
        ? `Waiting on ${formatPartyList(holders.waitingOn)} to finish Stage ${holders.stage.number} (${holders.stage.shortTitle}).`
        : 'This step is not available for your action yet.'
    }
    if (currentStage.id === 'inquiry') {
      if (!asString(formData.apartmentId)) {
        return 'Select a unit before continuing.'
      }
      if (!asString(formData.applicantName).trim() || !asString(formData.applicantEmail).trim()) {
        return 'Applicant name and email are required before continuing.'
      }
      if (Number(asString(formData.occupantCount) || '1') >= 2) {
        if (
          !asString(formData.applicant2Name).trim() ||
          !asString(formData.applicant2Email).trim() ||
          !asString(formData.applicant2Phone).trim()
        ) {
          return 'Second applicant full name, email, and phone are required when there are 2 applicants.'
        }
      }
    }
    if (currentStage.id === 'kyc') {
      if (boolFlag(formData.kycAffordabilityRejected)) {
        return 'This application was rejected based on affordability. It cannot continue.'
      }
      if (!boolFlag(formData.kycAffordabilityApproved) && landlordLed) {
        return 'Approve the income & expenses outcome before continuing to KYC.'
      }
      if (landlordLed) {
        if (!boolFlag(formData.landlordKycApproved) && !boolFlag(formData.tenantKycApproved)) {
          return 'Landlord or tenant KYC approval is required before continuing.'
        }
      } else if (!formData.agentKycApproved) {
        return 'Agent approval is required before continuing.'
      }
    }
    if (currentStage.id === 'documents') {
      if (!formData.creditCheckConsent || !formData.docsSubmitted) {
        return 'Both consent checkboxes are required before continuing.'
      }
    }
    if (currentStage.id === 'lease') {
      if (!partyHasSigned('lease', formData, user?.role)) {
        return 'Confirm your lease signature checkbox before continuing.'
      }
      if (user?.role === 'admin' || user?.role === 'agent') {
        return 'Lease signing is confirmed by the tenant and landlord. You can upload the lease PDF, but only they click Next to unlock move-in.'
      }
    }
    if (currentStage.id === 'movein') {
      if (user?.role === 'tenant') {
        return landlordLed
          ? 'Acknowledge the apartment condition with the checkbox. Only the landlord can click Next to finish.'
          : 'Acknowledge the apartment condition with the checkbox. Only the agent can click Next to finish.'
      }
      if (landlordLed) {
        if (user?.role === 'landlord') {
          if (!partyHasSigned('movein', formData, 'landlord')) {
            return 'Confirm the move-in inspection acknowledgment before clicking Next.'
          }
          if (!partyHasSigned('movein', formData, 'tenant')) {
            return 'The tenant must acknowledge the recorded condition before you can continue.'
          }
        } else if (user?.role === 'admin' || user?.role === 'agent') {
          return 'This landlord-led move-in is completed by the landlord and tenant.'
        }
      } else {
        if (user?.role === 'landlord') {
          if (!partyHasSigned('movein', formData, 'landlord')) {
            return 'Acknowledge the move-in inspection before the agent can finish.'
          }
          return 'Acknowledgment saved. Waiting for the agent to click Next.'
        }
        if (!partyHasSigned('movein', formData, 'agent')) {
          return 'Confirm the inspection is accurate before clicking Next.'
        }
        if (!partyHasSigned('movein', formData, 'tenant')) {
          return 'The tenant must acknowledge the recorded condition before you can continue.'
        }
        if (!partyHasSigned('movein', formData, 'landlord')) {
          return 'The landlord must acknowledge the move-in inspection before you can continue.'
        }
      }
    }
    return null
  }

  function boolFlag(value: unknown): boolean {
    return value === true || value === 'true' || value === 1 || value === '1'
  }

  async function persistProgress(
    applicationId: string,
    nextCompleted: Set<StageId>,
    nextForm: Record<string, unknown>,
    stageId: StageId,
  ) {
    const completenessPct = Math.round(
      ((STAGES.findIndex((s) => s.id === stageId) + 1) / STAGES.length) * 100,
    )
    await patchApplication(applicationId, {
      status: STAGE_STATUS[stageId] ?? 'in_progress',
      completenessPct,
      formData: nextForm,
      completedStages: Array.from(nextCompleted),
      ...(isAgent || isLandlord
        ? {
            apartmentId: asString(nextForm.apartmentId) || null,
            applicantName: asString(nextForm.applicantName) || undefined,
            applicantEmail: asString(nextForm.applicantEmail) || undefined,
          }
        : {}),
      applicantPhone: asString(nextForm.applicantPhone) || null,
    })
  }

  async function finaliseTenancy(
    applicationId: string,
    nextForm: Record<string, unknown>,
    nextCompleted: Set<StageId>,
  ) {
    if (assignedTenantId) return
    if (!isAgent && !isLandlord) return
    const apartmentId = asString(nextForm.apartmentId)
    if (!apartmentId) return

    let tenantId: string | null = null
    if (isAgent) {
      const tenant = await completeApplication({
        apartmentId,
        applicationId,
        name: asString(nextForm.applicantName),
        email: asString(nextForm.applicantEmail),
        phone: asString(nextForm.applicantPhone),
        leaseStart: asString(nextForm.moveInDate) || asString(nextForm.leaseStartDate),
        leaseEnd: asString(nextForm.termEndDate) || asString(nextForm.leaseEndDate),
        agentName: asString(nextForm.agentName),
        moveInSummary: asString(nextForm.inspectionNotes) || undefined,
      })
      if (!tenant) return
      tenantId = tenant.id
    } else {
      const result = await createTenant({
        apartmentId,
        applicationId,
        name: asString(nextForm.applicantName).trim() || 'New tenant',
        email: asString(nextForm.applicantEmail).trim() || 'tenant@example.com',
        phone: asString(nextForm.applicantPhone).trim() || '0000000000',
        leaseStart:
          asString(nextForm.moveInDate) ||
          asString(nextForm.leaseStartDate) ||
          new Date().toISOString().slice(0, 10),
        leaseEnd:
          asString(nextForm.termEndDate) ||
          asString(nextForm.leaseEndDate) ||
          new Date().toISOString().slice(0, 10),
        status: 'active',
        balance: 0,
        moveInInspection: asString(nextForm.inspectionNotes)
          ? {
              date: new Date().toISOString().slice(0, 10),
              agent: asString(nextForm.landlordName) || 'Landlord',
              summary: asString(nextForm.inspectionNotes),
            }
          : undefined,
      })
      tenantId = String(result.data.id)
    }

    if (!tenantId) return

    setAssignedTenantId(tenantId)
    setFormData((prev) => ({ ...prev, tenantId }))
    await patchApplication(applicationId, {
      status: 'tenant',
      completenessPct: 100,
      formData: { ...nextForm, tenantId },
      completedStages: Array.from(nextCompleted),
    })

    const creditScore = Number(asString(nextForm.creditScore))
    const grossSalary = Number(asString(nextForm.grossSalary || nextForm.incomeGross))
    const targetRent = Number(asString(nextForm.targetRent || nextForm.apartmentAmount))
    let band: 'green' | 'amber' | 'red' = 'amber'
    const rec = asString(nextForm.creditRecommendation).toLowerCase()
    if (
      rec.includes('decline') ||
      rec.includes('reject') ||
      asString(nextForm.kycStatus).toLowerCase() === 'fail'
    ) {
      band = 'red'
    } else if (
      rec.includes('approve') ||
      asString(nextForm.kycStatus).toLowerCase() === 'pass' ||
      asString(nextForm.kycStatus).toLowerCase() === 'verified'
    ) {
      band = 'green'
    }

    await saveApplicationScreening(applicationId, {
      enquiryType: 'kyc_credit',
      status: 'completed',
      providerRef: asString(nextForm.kycRef) || null,
      summary: {
        kycStatus: asString(nextForm.kycStatus),
        kycIdType: asString(nextForm.kycIdType),
        kycDate: asString(nextForm.kycDate),
        kycSummary: asString(nextForm.kycSummary),
        creditScore: asString(nextForm.creditScore),
        creditPullDate: asString(nextForm.creditPullDate),
        creditRecommendation: asString(nextForm.creditRecommendation),
        agentApproval: asString(nextForm.agentApproval),
      },
      affordability: {
        band,
        score: Number.isFinite(creditScore) ? creditScore : null,
        reasons: [asString(nextForm.kycSummary)].filter(Boolean),
      },
      income: {
        grossSalary: Number.isFinite(grossSalary) ? grossSalary : null,
        targetRent: Number.isFinite(targetRent) ? targetRent : null,
      },
      linkTenantId: tenantId,
    }).catch(() => {})
  }

  async function savePartialProgress() {
    setError(null)
    if (!editable && mode !== 'observing') return
    setSaving(true)
    try {
      const applicationId = await ensureApplication(formData)
      const nextForm: Record<string, unknown> = { ...formData, applicationId }
      const saved = await patchApplication(applicationId, {
        status: STAGE_STATUS[currentStage.id] ?? 'in_progress',
        formData: nextForm,
        completedStages: Array.from(completed),
        ...(isAgent || isLandlord
          ? {
              apartmentId: asString(nextForm.apartmentId) || null,
              applicantName: asString(nextForm.applicantName) || undefined,
              applicantEmail: asString(nextForm.applicantEmail) || undefined,
            }
          : {}),
        applicantPhone: asString(nextForm.applicantPhone) || null,
      })
      const remoteForm = (saved.data.formData ?? nextForm) as Record<string, unknown>
      const mergedForm = mergeSharedFlags(
        { ...nextForm, applicationId },
        remoteForm,
      )
      setFormData(mergedForm)
      if (Array.isArray(saved.data.completedStages)) {
        setCompleted(new Set(saved.data.completedStages as StageId[]))
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save progress')
    } finally {
      setSaving(false)
    }
  }

  async function goNext() {
    setError(null)

    if (mode === 'waiting') {
      setError(
        holders
          ? `Waiting on ${formatPartyList(holders.waitingOn)} to finish Stage ${holders.stage.number} (${holders.stage.shortTitle}) before anyone can continue.`
          : 'This step is locked until the responsible party completes it.',
      )
      return
    }

    // Shared step: already clicked Next — wait for the other parties (no auto jump from button)
    if (mode === 'observing' && isSharedStep) {
      if (advancePending.length === 0) {
        setCurrentIndex(Math.min(STAGES.length - 1, activeIndex))
        return
      }
      setError(`Waiting on ${formatPartyList(advancePending)} to click Next.`)
      return
    }

    if (mode === 'view' && !isActiveStep && !stageComplete) {
      setCurrentIndex(activeIndex)
      return
    }

    if (mode === 'view' && stageComplete && !isLast) {
      setCurrentIndex(Math.min(STAGES.length - 1, activeIndex))
      return
    }

    const validationError = validateCurrentStage()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    try {
      const applicationId = await ensureApplication(formData)
      let nextForm: Record<string, unknown> = { ...formData, applicationId }
      let nextCompleted = new Set(completed)

      if (sharedStageId) {
        // Lease: tenant/landlord Next. Move-in: agent Next unlocks success for everyone.
        nextForm = markPartyAdvanced(sharedStageId, nextForm, user?.role)
        const stillPending = pendingAdvanceForStage(sharedStageId, nextForm)
        if (stillPending.length === 0) {
          nextCompleted.add(currentStage.id)
        }
      } else {
        nextCompleted.add(currentStage.id)
      }

      setFormData(nextForm)
      setCompleted(nextCompleted)
      await persistProgress(applicationId, nextCompleted, nextForm, currentStage.id)

      if (sharedStageId) {
        const stillPending = pendingAdvanceForStage(sharedStageId, nextForm)
        if (stillPending.length > 0) {
          setError(
            `Saved. Waiting on ${formatPartyList(stillPending)} to click Next.`,
          )
          return
        }

        // All parties clicked Next on move-in — finalise tenancy, then open success for all.
        if (sharedStageId === 'movein') {
          nextCompleted.add('success')
          setCompleted(nextCompleted)
          if (!assignedTenantId && (isAgent || isLandlord)) {
            await finaliseTenancy(applicationId, nextForm, nextCompleted)
          } else {
            await persistProgress(applicationId, nextCompleted, nextForm, 'success')
          }
        }

        setCurrentIndex((i) => Math.min(STAGES.length - 1, i + 1))
        return
      }

      setCurrentIndex((i) => Math.min(STAGES.length - 1, i + 1))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save application progress')
    } finally {
      setSaving(false)
    }
  }

  async function reinviteApplicant() {
    const email = asString(formData.applicantEmail).trim()
    const applicationId = asString(formData.applicationId)
    if (!email || !applicationId) {
      setError('Applicant email and saved application are required to invite.')
      return
    }
    try {
      const result = await createInvite({
        email,
        role: 'tenant',
        applicationId,
      })
      setInviteUrl(result.data.inviteUrl)
      void navigator.clipboard.writeText(result.data.inviteUrl).then(() => {
        setInviteCopied(true)
        window.setTimeout(() => setInviteCopied(false), 2000)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create invite')
    }
  }

  function goToStage(index: number) {
    if (!isStageReachable(index, completed, formData)) {
      setError(
        holders
          ? `Step ${index + 1} is locked. Waiting on ${formatPartyList(holders.waitingOn)} to finish Stage ${holders.stage.number} (${holders.stage.shortTitle}).`
          : 'That step is locked until earlier steps are completed.',
      )
      return
    }
    setError(null)
    setCurrentIndex(index)
  }

  // If agent/landlord reaches success after another party clicked the last move-in Next, finalise.
  useEffect(() => {
    if (currentStage.id !== 'success') return
    if ((!isAgent && !isLandlord) || assignedTenantId) return
    const applicationId = asString(formData.applicationId) || routeId
    if (!applicationId) return
    if (pendingAdvanceForStage('movein', formData).length > 0) return
    void finaliseTenancy(applicationId, formData, new Set(completed).add('success'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStage.id, isAgent, isLandlord, assignedTenantId, formData.applicationId, routeId])

  if (loading) {
    return (
      <div className="app apply-page" style={{ padding: '2rem' }}>
        Loading application…
      </div>
    )
  }

  const nextLabel = (() => {
    if (saving) return 'Saving…'
    if (isSuccessStep) return 'Go to Dashboard'
    if (mode === 'waiting') return 'Waiting…'
    if (mode === 'observing' && isSharedStep) {
      return advancePending.length === 0 ? 'Continue to next step' : 'Waiting for others…'
    }
    if (mode === 'view' && !isActiveStep) return 'Go to current step'
    if (currentStage.id === 'movein' && user?.role === 'tenant') {
      return 'Waiting for agent…'
    }
    if (currentStage.id === 'lease' && (user?.role === 'admin' || user?.role === 'agent')) {
      return 'Waiting for signatures…'
    }
    return 'Next'
  })()

  const nextDisabled =
    saving ||
    mode === 'waiting' ||
    (mode === 'observing' && isSharedStep && advancePending.length > 0) ||
    (editable &&
      currentStage.id === 'lease' &&
      (user?.role === 'admin' ||
        user?.role === 'agent' ||
        !partyHasSigned('lease', formData, user?.role))) ||
    (editable &&
      currentStage.id === 'movein' &&
      (user?.role === 'tenant' ||
        user?.role === 'landlord' ||
        !partyHasSigned('movein', formData, 'agent') ||
        !partyHasSigned('movein', formData, 'tenant')))

  return (
    <div className="app apply-page">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p className="brand-eyebrow">Property25</p>
            <h1 className="brand-title">Tenant Application</h1>
          </div>
        </div>
        <div className="header-meta-row">
          <p className="header-meta">
            Step {currentIndex + 1} of {STAGES.length}
            {allComplete ? ' · Complete' : ` · Active: Stage ${activeIndex + 1}`}
          </p>
          <Link to={homePathForRole(user)} className="btn btn-ghost btn-compact">
            Back to dashboard
          </Link>
        </div>
      </header>

      {holders && !allComplete ? (
        <div
          className={`progress-hold-banner${roleCanAct(holders.waitingOn, user?.role) ? ' progress-hold-yours' : ' progress-hold-theirs'}`}
          role="status"
        >
          <strong>
            {roleCanAct(holders.waitingOn, user?.role)
              ? 'Your action is needed'
              : `Waiting on ${formatPartyList(holders.waitingOn)}`}
          </strong>
          <span>
            Stage {holders.stage.number}: {holders.stage.title}. Later steps stay locked
            until this is finished.
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="login-error" style={{ margin: '0 1.5rem 1rem' }}>
          {error}
        </p>
      ) : null}

      {inviteUrl ? (
        <p className="role-callout role-agent" style={{ margin: '0 1.5rem 1rem' }} role="status">
          <strong>Applicant invite link</strong>
          <span className="invite-link-row">
            <span style={{ wordBreak: 'break-all' }}>{inviteUrl}</span>
            <button
              type="button"
              className="invite-copy-btn"
              title={inviteCopied ? 'Copied' : 'Copy invite link'}
              aria-label={inviteCopied ? 'Copied' : 'Copy invite link'}
              onClick={() => {
                void navigator.clipboard.writeText(inviteUrl).then(() => {
                  setInviteCopied(true)
                  window.setTimeout(() => setInviteCopied(false), 2000)
                })
              }}
            >
              {inviteCopied ? '✓' : '⧉'}
            </button>
          </span>
        </p>
      ) : null}

      <Timeline
        stages={STAGES}
        currentIndex={currentIndex}
        completed={completed}
        formData={formData}
        viewerRole={user?.role}
        onSelect={goToStage}
      />

      <main className="stage-main">
        <StagePanel
          stage={currentStage}
          formData={formData}
          onChange={updateField}
          mode={mode}
          viewerRole={user?.role}
          waitingOn={waitingOn}
          isActiveStep={isActiveStep}
        />

        <div className={`stage-actions${isSuccessStep ? ' stage-actions-success' : ''}`}>
          {isSuccessStep ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(homePathForRole(user))}
            >
              Go to Dashboard
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={currentIndex === 0 || saving}
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              >
                Back
              </button>

              {(isAgent || isLandlord) && asString(formData.applicationId) ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void reinviteApplicant()}
                >
                  Copy applicant invite
                </button>
              ) : null}

              {editable && (currentStage.id === 'lease' || currentStage.id === 'movein') ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={saving}
                  onClick={() => void savePartialProgress()}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              ) : null}

              <button
                type="button"
                className="btn btn-primary"
                disabled={nextDisabled}
                onClick={() => void goNext()}
              >
                {nextLabel}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

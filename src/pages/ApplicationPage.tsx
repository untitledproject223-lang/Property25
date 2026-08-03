import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { PortalRole, StageId } from '../stages'
import {
  STAGES,
  activeStageIndex,
  canEditStage,
  formatPartyList,
  isStageFullyComplete,
  isStageReachable,
  pendingPartiesForStage,
  progressHolders,
} from '../stages'
import { Timeline } from '../components/Timeline'
import { StagePanel } from '../components/StagePanel'
import { useAuth } from '../data/AuthContext'
import { useDashboard } from '../data/DashboardContext'
import {
  createApplication,
  createInvite,
  fetchApplication,
  patchApplication,
  saveApplicationScreening,
} from '../data/api'
import { homePathForRole } from '../portal/homePath'
import '../App.css'

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

const STAGE_STATUS: Record<StageId, string> = {
  inquiry: 'in_progress',
  documents: 'in_progress',
  kycFees: 'in_progress',
  kyc: 'under_review',
  payment: 'awaiting_signature',
  lease: 'awaiting_signature',
  completion: 'approved',
  movein: 'tenant',
}

const DUMMY_AGENT_FIELDS: Record<string, string> = {
  agentName: 'Alex Morgan',
  agency: 'Midpoint Realty Demo',
  agentEmail: 'alex.morgan@midpoint-demo.test',
  agentPhone: '+27 21 555 0140',
}

function createInitialFormData(): Record<string, unknown> {
  return { ...DUMMY_AGENT_FIELDS }
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
  const { completeApplication } = useDashboard()

  const [currentIndex, setCurrentIndex] = useState(0)
  const [completed, setCompleted] = useState<Set<StageId>>(new Set())
  const [formData, setFormData] = useState<Record<string, unknown>>(createInitialFormData)
  const [assignedTenantId, setAssignedTenantId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(Boolean(routeId))
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)

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
  const canEdit = canEditStage(currentStage.id, user?.role)
  const waitingOn = holders && isActiveStep ? holders.waitingOn : []
  const iAmWaitingParty = roleCanAct(waitingOn, user?.role)

  const mode: 'edit' | 'view' | 'waiting' = stageComplete
    ? 'view'
    : isActiveStep
      ? canEdit && iAmWaitingParty
        ? 'edit'
        : 'waiting'
      : 'view'

  const editable = mode === 'edit'

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
          ...createInitialFormData(),
          ...form,
          applicationId: String(data.id),
          applicantName: form.applicantName ?? data.applicant_name ?? data.applicantName,
          applicantEmail: form.applicantEmail ?? data.applicant_email ?? data.applicantEmail,
          applicantPhone: form.applicantPhone ?? data.applicant_phone ?? data.applicantPhone,
          apartmentId: form.apartmentId ?? data.apartment_id ?? data.apartmentId,
        }
        const nextCompleted = new Set(stages.filter(Boolean) as StageId[])
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

  function updateField(key: string, value: unknown) {
    if (!editable) return
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  async function ensureApplication(data: Record<string, unknown>) {
    const existing = asString(data.applicationId)
    if (existing) return existing

    if (!isAgent) {
      throw new Error('Only an agent can start a new application.')
    }

    const name = asString(data.applicantName).trim()
    const email = asString(data.applicantEmail).trim()
    const phone = asString(data.applicantPhone).trim()
    if (!name || !email) {
      throw new Error('Applicant name and email are required before continuing.')
    }

    const apartmentId = asString(data.apartmentId) || null
    const result = await createApplication({
      apartmentId,
      applicantName: name,
      applicantEmail: email,
      applicantPhone: phone || undefined,
      status: 'in_progress',
      inviteApplicant: true,
      formData: data,
    })
    const id = String(result.data.id)
    if (result.data.invite?.inviteUrl) {
      setInviteUrl(result.data.invite.inviteUrl)
    }
    setFormData((prev) => ({ ...prev, applicationId: id }))
    navigate(`/apply/${id}`, { replace: true })
    return id
  }

  function validateCurrentStage(): string | null {
    if (!editable) {
      return holders
        ? `Waiting on ${formatPartyList(holders.waitingOn)} to finish Stage ${holders.stage.number} (${holders.stage.shortTitle}).`
        : 'This step is not available for your action yet.'
    }
    if (currentStage.id === 'kyc') {
      if (!formData.agentKycApproved) {
        return 'Agent approval is required before continuing.'
      }
    }
    if (currentStage.id === 'documents') {
      if (!formData.creditCheckConsent || !formData.docsSubmitted) {
        return 'Both consent checkboxes are required before continuing.'
      }
    }
    if (currentStage.id === 'lease') {
      const pending = pendingPartiesForStage('lease', formData)
      if (pending.length > 0) {
        return `Lease signing is incomplete. Still waiting on ${formatPartyList(pending)}.`
      }
    }
    if (currentStage.id === 'movein') {
      const pending = pendingPartiesForStage('movein', formData)
      if (pending.length > 0) {
        return `Move-in inspection is incomplete. Still waiting on ${formatPartyList(pending)}.`
      }
    }
    return null
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
    })
  }

  async function savePartialProgress() {
    setError(null)
    if (!editable) return
    setSaving(true)
    try {
      const applicationId = await ensureApplication(formData)
      const nextForm = { ...formData, applicationId }
      await persistProgress(applicationId, completed, nextForm, currentStage.id)
      setFormData(nextForm)
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

    if (mode === 'view' && !isActiveStep) {
      // Reviewing a completed step — jump back to the active pending step
      setCurrentIndex(activeIndex)
      return
    }

    const validationError = validateCurrentStage()
    if (validationError) {
      // For shared steps, still allow saving my signature without advancing
      const sharedIncomplete =
        editable &&
        (currentStage.id === 'lease' || currentStage.id === 'movein') &&
        (validationError.startsWith('Lease signing is incomplete') ||
          validationError.startsWith('Move-in inspection is incomplete'))
      if (sharedIncomplete) {
        await savePartialProgress()
        setError(validationError)
        return
      }
      setError(validationError)
      return
    }

    setSaving(true)
    try {
      const nextCompleted = new Set(completed).add(currentStage.id)
      setCompleted(nextCompleted)

      const applicationId = await ensureApplication(formData)
      const nextForm = { ...formData, applicationId }
      await persistProgress(applicationId, nextCompleted, nextForm, currentStage.id)

      if (isLast) {
        if (!assignedTenantId && isAgent) {
          const apartmentId = asString(formData.apartmentId)
          if (apartmentId) {
            const tenant = await completeApplication({
              apartmentId,
              name: asString(formData.applicantName),
              email: asString(formData.applicantEmail),
              phone: asString(formData.applicantPhone),
              leaseStart:
                asString(formData.moveInDate) || asString(formData.leaseStartDate),
              leaseEnd:
                asString(formData.termEndDate) || asString(formData.leaseEndDate),
              agentName: asString(formData.agentName),
              moveInSummary: asString(formData.inspectionNotes) || undefined,
            })
            if (tenant) {
              setAssignedTenantId(tenant.id)
              setFormData((prev) => ({ ...prev, tenantId: tenant.id }))
              await patchApplication(applicationId, {
                status: 'tenant',
                completenessPct: 100,
                formData: { ...nextForm, tenantId: tenant.id },
                completedStages: Array.from(nextCompleted),
              })

              const creditScore = Number(asString(formData.creditScore))
              const grossSalary = Number(
                asString(formData.grossSalary || formData.incomeGross),
              )
              const targetRent = Number(asString(formData.targetRent || formData.rentAmount))
              let band: 'green' | 'amber' | 'red' = 'amber'
              const rec = asString(formData.creditRecommendation).toLowerCase()
              if (
                rec.includes('decline') ||
                rec.includes('reject') ||
                asString(formData.kycStatus).toLowerCase() === 'fail'
              ) {
                band = 'red'
              } else if (
                rec.includes('approve') ||
                asString(formData.kycStatus).toLowerCase() === 'pass'
              ) {
                band = 'green'
              }

              await saveApplicationScreening(applicationId, {
                enquiryType: 'kyc_credit',
                status: 'completed',
                providerRef: asString(formData.kycRef) || null,
                summary: {
                  kycStatus: asString(formData.kycStatus),
                  kycIdType: asString(formData.kycIdType),
                  kycDate: asString(formData.kycDate),
                  kycSummary: asString(formData.kycSummary),
                  creditScore: asString(formData.creditScore),
                  creditPullDate: asString(formData.creditPullDate),
                  creditRecommendation: asString(formData.creditRecommendation),
                  agentApproval: asString(formData.agentApproval),
                },
                affordability: {
                  band,
                  score: Number.isFinite(creditScore) ? creditScore : null,
                  reasons: [asString(formData.kycSummary)].filter(Boolean),
                },
                income: {
                  grossSalary: Number.isFinite(grossSalary) ? grossSalary : null,
                  targetRent: Number.isFinite(targetRent) ? targetRent : null,
                },
                linkTenantId: tenant.id,
              }).catch(() => {})
            }
          }
        }
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

  function startOver() {
    if (!isAgent) return
    setCompleted(new Set())
    setCurrentIndex(0)
    setFormData(createInitialFormData())
    setAssignedTenantId(null)
    setInviteUrl(null)
    setError(null)
    navigate('/apply', { replace: true })
  }

  if (loading) {
    return (
      <div className="app apply-page" style={{ padding: '2rem' }}>
        Loading application…
      </div>
    )
  }

  const nextLabel = (() => {
    if (saving) return 'Saving…'
    if (allComplete && isLast) return 'Complete application'
    if (mode === 'waiting') return 'Waiting…'
    if (mode === 'view' && !isActiveStep) return 'Go to current step'
    if (currentStage.id === 'lease' || currentStage.id === 'movein') {
      const pending = pendingPartiesForStage(currentStage.id, formData)
      if (pending.length > 0) return 'Save my progress'
      return isLast ? 'Complete application' : 'Next'
    }
    return isLast ? 'Complete application' : 'Next'
  })()

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
          <span style={{ wordBreak: 'break-all' }}>{inviteUrl}</span>
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
        {allComplete && isLast ? (
          <div className="completion-banner">
            <h2>Application journey complete</h2>
            <p>
              {assignedTenantId
                ? 'The selected unit has been updated with this tenant.'
                : 'All timeline stops have been reviewed.'}
            </p>
          </div>
        ) : null}

        <StagePanel
          stage={currentStage}
          formData={formData}
          onChange={updateField}
          mode={mode}
          viewerRole={user?.role}
          waitingOn={waitingOn}
          isActiveStep={isActiveStep}
        />

        <div className="stage-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={currentIndex === 0 || saving}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          >
            Back
          </button>

          {isAgent && asString(formData.applicationId) ? (
            <button type="button" className="btn btn-ghost" onClick={() => void reinviteApplicant()}>
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

          {allComplete && isLast && isAgent ? (
            <button type="button" className="btn btn-primary" onClick={startOver}>
              Start over
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || mode === 'waiting'}
              onClick={() => void goNext()}
            >
              {nextLabel}
            </button>
          )}
        </div>
      </main>
    </div>
  )
}

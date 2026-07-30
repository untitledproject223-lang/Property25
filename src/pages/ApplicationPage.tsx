import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { StageId } from '../stages'
import { STAGES } from '../stages'
import { Timeline } from '../components/Timeline'
import { StagePanel } from '../components/StagePanel'
import { useDashboard } from '../data/DashboardContext'
import { createApplication, patchApplication } from '../data/api'
import '../App.css'

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

const STAGE_STATUS: Record<StageId, string> = {
  inquiry: 'in_progress',
  documents: 'in_progress',
  kyc: 'under_review',
  payment: 'awaiting_signature',
  lease: 'awaiting_signature',
  completion: 'approved',
  movein: 'tenant',
}

export default function ApplicationPage() {
  const navigate = useNavigate()
  const { completeApplication } = useDashboard()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completed, setCompleted] = useState<Set<StageId>>(new Set())
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [assignedTenantId, setAssignedTenantId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const currentStage = STAGES[currentIndex]
  const isLast = currentIndex === STAGES.length - 1

  const maxReached = useMemo(() => {
    const completedIndexes = STAGES.map((s, i) => (completed.has(s.id) ? i : -1))
    return Math.max(currentIndex, ...completedIndexes)
  }, [completed, currentIndex])

  const allComplete = completed.size === STAGES.length

  function updateField(key: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  async function ensureApplication(data: Record<string, unknown>) {
    const existing = asString(data.applicationId)
    if (existing) return existing

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
    })
    const id = String(result.data.id)
    setFormData((prev) => ({ ...prev, applicationId: id }))
    return id
  }

  async function goNext() {
    setError(null)
    setSaving(true)
    try {
      const nextCompleted = new Set(completed).add(currentStage.id)
      setCompleted(nextCompleted)

      const applicationId = await ensureApplication(formData)
      const completenessPct = Math.round(((currentIndex + 1) / STAGES.length) * 100)
      await patchApplication(applicationId, {
        status: STAGE_STATUS[currentStage.id] ?? 'in_progress',
        completenessPct,
      })

      if (isLast) {
        if (!assignedTenantId) {
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
              })
            }
          }
        }
        return
      }

      setCurrentIndex((i) => i + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save application progress')
    } finally {
      setSaving(false)
    }
  }

  function goToStage(index: number) {
    if (index <= maxReached) {
      setCurrentIndex(index)
    }
  }

  function startOver() {
    setCompleted(new Set())
    setCurrentIndex(0)
    setFormData({})
    setAssignedTenantId(null)
    setError(null)
  }

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
            {allComplete ? ' · Complete' : ''}
          </p>
          <Link to="/" className="btn btn-ghost btn-compact">
            Back to dashboard
          </Link>
        </div>
      </header>

      {error ? (
        <p className="login-error" style={{ margin: '0 1.5rem 1rem' }}>
          {error}
        </p>
      ) : null}

      <Timeline
        stages={STAGES}
        currentIndex={currentIndex}
        completed={completed}
        onSelect={goToStage}
      />

      <main className="stage-main">
        {allComplete && isLast ? (
          <div className="completion-banner">
            <h2>Application journey complete</h2>
            <p>
              {assignedTenantId
                ? 'The selected unit has been updated with this tenant. You can view them on the dashboard.'
                : 'All timeline stops have been reviewed. Select a vacant unit in step 1 so the unit can be assigned on completion.'}
            </p>
            {assignedTenantId ? (
              <div className="btn-row" style={{ marginTop: '0.85rem' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-compact"
                  onClick={() => navigate(`/tenants/${assignedTenantId}`)}
                >
                  View tenant
                </button>
                <Link to="/units" className="btn btn-ghost btn-compact">
                  View units
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        <StagePanel stage={currentStage} formData={formData} onChange={updateField} />

        <div className="stage-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={currentIndex === 0 || saving}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          >
            Back
          </button>

          {allComplete && isLast ? (
            <button type="button" className="btn btn-primary" onClick={startOver}>
              Start over
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => void goNext()}
            >
              {saving ? 'Saving…' : isLast ? 'Complete application' : 'Next'}
            </button>
          )}
        </div>
      </main>
    </div>
  )
}

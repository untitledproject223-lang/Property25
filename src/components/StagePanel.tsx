import type { AuthRole } from '../data/api'
import type { PortalRole, StageDefinition } from '../stages'
import { formatPartyList, pendingPartiesForStage } from '../stages'
import {
  InquiryForm,
  DocumentsForm,
  KycFeesForm,
  KycForm,
  PaymentForm,
  LeaseForm,
  CompletionForm,
  MoveInForm,
} from './forms'
import './StagePanel.css'

interface StagePanelProps {
  stage: StageDefinition
  formData: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  mode?: 'edit' | 'view' | 'waiting'
  viewerRole?: AuthRole
  waitingOn?: PortalRole[]
  isActiveStep?: boolean
}

function stageHeading(stage: StageDefinition, formData: Record<string, unknown>) {
  if (stage.id === 'kyc') {
    const name =
      typeof formData.applicantName === 'string' && formData.applicantName.trim()
        ? formData.applicantName.trim()
        : '…'
    return `KYC report for ${name}`
  }
  return stage.title
}

export function StagePanel({
  stage,
  formData,
  onChange,
  mode = 'edit',
  viewerRole,
  waitingOn = [],
  isActiveStep = false,
}: StagePanelProps) {
  const waiting = mode === 'waiting'
  const viewOnly = mode === 'view' || waiting
  const sharedPending =
    (stage.id === 'lease' || stage.id === 'movein') && mode === 'edit'
      ? pendingPartiesForStage(stage.id, formData).filter((r) => {
          if (!viewerRole) return true
          if (viewerRole === 'admin') return r !== 'agent'
          return r !== viewerRole
        })
      : []

  return (
    <section
      className={`stage-panel phase-${stage.phase}${waiting ? ' stage-waiting' : ''}${mode === 'view' ? ' stage-readonly' : ''}`}
      aria-labelledby="stage-heading"
    >
      <header className="stage-panel-header">
        <div className="stage-kicker-row">
          <p className="stage-kicker">Stage {stage.number}</p>
          {stage.editorLabel ? (
            <span
              className={`role-badge role-${stage.editorRole ?? 'internal'}`}
              role="status"
            >
              {stage.editorLabel}
            </span>
          ) : null}
          {waiting ? (
            <span className="role-badge role-waiting" role="status">
              Waiting on {formatPartyList(waitingOn)}
            </span>
          ) : mode === 'view' ? (
            <span className="role-badge role-internal" role="status">
              Completed · view only
            </span>
          ) : (
            <span className="role-badge role-action" role="status">
              Your action required
            </span>
          )}
        </div>
        <h2 id="stage-heading">{stageHeading(stage, formData)}</h2>
        <p className="stage-desc">{stage.description}</p>

        {waiting ? (
          <div className="stage-waiting-banner" role="alert">
            <strong>Progress is waiting on {formatPartyList(waitingOn)}</strong>
            <span>
              You cannot edit this step or open later steps until{' '}
              {formatPartyList(waitingOn)} finishes Stage {stage.number} (
              {stage.shortTitle}).
            </span>
          </div>
        ) : sharedPending.length > 0 && isActiveStep ? (
          <div className="stage-partial-banner" role="status">
            <strong>Still waiting on {formatPartyList(sharedPending)}</strong>
            <span>
              Complete your part below. The next step unlocks only after every party has
              signed off.
            </span>
          </div>
        ) : (
          <p className="stage-optional">
            {mode === 'view'
              ? 'This step is finished. You can review it, but later steps stay locked until the current pending party acts.'
              : stage.id === 'kyc'
                ? 'Agent approval is required before continuing.'
                : stage.id === 'documents'
                  ? 'Both consent checkboxes are required before continuing.'
                  : 'Complete your required fields, then continue.'}
          </p>
        )}
      </header>

      <div
        className={`stage-panel-body${viewOnly ? ' stage-view-only' : ''}${waiting ? ' stage-body-waiting' : ''}`}
      >
        <fieldset disabled={viewOnly} className="stage-fieldset">
          {stage.id === 'inquiry' && <InquiryForm data={formData} onChange={onChange} />}
          {stage.id === 'documents' && <DocumentsForm data={formData} onChange={onChange} />}
          {stage.id === 'kycFees' && <KycFeesForm data={formData} onChange={onChange} />}
          {stage.id === 'kyc' && <KycForm data={formData} onChange={onChange} />}
          {stage.id === 'payment' && <PaymentForm data={formData} onChange={onChange} />}
          {stage.id === 'lease' && (
            <LeaseForm data={formData} onChange={onChange} viewerRole={viewerRole} />
          )}
          {stage.id === 'completion' && <CompletionForm data={formData} onChange={onChange} />}
          {stage.id === 'movein' && (
            <MoveInForm data={formData} onChange={onChange} viewerRole={viewerRole} />
          )}
        </fieldset>
      </div>
    </section>
  )
}

import type { AuthRole } from '../data/api'
import type { PortalRole, StageDefinition } from '../stages'
import {
  formatPartyList,
  leaseSignatureStatuses,
  moveInSignStatuses,
  partyHasAdvanced,
  pendingAdvanceForStage,
  pendingSignaturesForStage,
} from '../stages'
import {
  InquiryForm,
  DocumentsForm,
  KycFeesForm,
  KycForm,
  PaymentForm,
  LeaseForm,
  SuccessForm,
  MoveInForm,
} from './forms'
import './StagePanel.css'

interface StagePanelProps {
  stage: StageDefinition
  formData: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  mode?: 'edit' | 'view' | 'waiting' | 'observing'
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

function SharedSigningOutline({
  stageId,
  formData,
}: {
  stageId: 'lease' | 'movein'
  formData: Record<string, unknown>
}) {
  const statuses =
    stageId === 'lease'
      ? leaseSignatureStatuses(formData)
      : moveInSignStatuses(formData)
  const signed = statuses.filter((s) => s.done)
  const pendingSign = statuses.filter((s) => !s.done)
  const continued = statuses.filter((s) => partyHasAdvanced(stageId, formData, s.role))
  const pendingNext = statuses.filter((s) => !partyHasAdvanced(stageId, formData, s.role))

  return (
    <div className="stage-sign-outline" role="status">
      <p className="stage-sign-outline-line">
        <span className="stage-sign-label signed">Signed</span>
        {signed.length > 0 ? (
          signed.map((s) => (
            <span key={s.role} className="stage-sign-chip signed">
              {s.label}
              {stageId === 'lease' && typeof formData[s.nameKey] === 'string' && formData[s.nameKey]
                ? ` (${String(formData[s.nameKey])})`
                : ''}
            </span>
          ))
        ) : (
          <span className="stage-sign-empty">None yet</span>
        )}
      </p>
      <p className="stage-sign-outline-line">
        <span className="stage-sign-label pending">Pending signature</span>
        {pendingSign.length > 0 ? (
          pendingSign.map((s) => (
            <span key={s.role} className="stage-sign-chip pending">
              {s.label}
            </span>
          ))
        ) : (
          <span className="stage-sign-empty">None — everyone has signed</span>
        )}
      </p>
      <p className="stage-sign-outline-line">
        <span className="stage-sign-label signed">Clicked Next</span>
        {continued.length > 0 ? (
          continued.map((s) => (
            <span key={s.role} className="stage-sign-chip signed">
              {s.label}
            </span>
          ))
        ) : (
          <span className="stage-sign-empty">None yet</span>
        )}
      </p>
      <p className="stage-sign-outline-line">
        <span className="stage-sign-label pending">Pending Next</span>
        {pendingNext.length > 0 ? (
          pendingNext.map((s) => (
            <span key={s.role} className="stage-sign-chip pending">
              {s.label}
            </span>
          ))
        ) : (
          <span className="stage-sign-empty">None — everyone has continued</span>
        )}
      </p>
    </div>
  )
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
  const observing = mode === 'observing'
  const viewOnly = mode === 'view' || waiting || observing || stage.id === 'success'
  const isShared = stage.id === 'lease' || stage.id === 'movein'
  const advancePending = isShared ? pendingAdvanceForStage(stage.id, formData) : []
  const signaturePending = isShared ? pendingSignaturesForStage(stage.id, formData) : []
  const allAdvanced = isShared && advancePending.length === 0

  return (
    <section
      className={`stage-panel phase-${stage.phase}${waiting ? ' stage-waiting' : ''}${observing ? ' stage-observing' : ''}${mode === 'view' || stage.id === 'success' ? ' stage-readonly' : ''}${allAdvanced ? ' stage-all-signed' : ''}${stage.id === 'success' ? ' stage-success' : ''}`}
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
          {stage.id === 'success' ? (
            <span className="role-badge role-action" role="status">
              Complete
            </span>
          ) : allAdvanced ? (
            <span className="role-badge role-action" role="status">
              All parties continued
            </span>
          ) : waiting ? (
            <span className="role-badge role-waiting" role="status">
              Waiting on {formatPartyList(waitingOn)}
            </span>
          ) : observing ? (
            <span className="role-badge role-waiting" role="status">
              You clicked Next · waiting on others
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
        {stage.id !== 'success' ? (
          <p className="stage-desc">{stage.description}</p>
        ) : null}

        {stage.id === 'lease' || stage.id === 'movein' ? (
          <SharedSigningOutline stageId={stage.id} formData={formData} />
        ) : null}

        {stage.id === 'success' ? null : allAdvanced ? (
          <div className="stage-complete-banner" role="status">
            <strong>Everyone has signed and clicked Next</strong>
            <span>
              {stage.id === 'lease'
                ? 'Move-in inspection is now available for all parties.'
                : 'The success confirmation page is now available for all parties.'}
            </span>
          </div>
        ) : waiting ? (
          <div className="stage-waiting-banner" role="alert">
            <strong>Progress is waiting on {formatPartyList(waitingOn)}</strong>
            <span>
              You cannot edit this step or open later steps until{' '}
              {formatPartyList(waitingOn)} finishes Stage {stage.number} (
              {stage.shortTitle}).
            </span>
          </div>
        ) : observing ? (
          <div className="stage-partial-banner" role="status">
            <strong>
              You clicked Next. Still waiting on {formatPartyList(advancePending)}
            </strong>
            <span>
              Others can still sign and click Next. This page updates when they do — the
              next step unlocks only after all three parties continue.
            </span>
          </div>
        ) : isShared && isActiveStep ? (
          <div className="stage-partial-banner" role="status">
            <strong>
              {signaturePending.length > 0
                ? 'Sign your section, then click Next'
                : 'Click Next to continue'}
            </strong>
            <span>
              You do not need to wait for the other parties to sign before clicking Next.
              The next step unlocks only after tenant, landlord, and agent have each
              clicked Next.
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
        className={`stage-panel-body${viewOnly ? ' stage-view-only' : ''}${waiting ? ' stage-body-waiting' : ''}${observing ? ' stage-body-observing' : ''}`}
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
          {stage.id === 'movein' && (
            <MoveInForm data={formData} onChange={onChange} viewerRole={viewerRole} />
          )}
          {stage.id === 'success' && <SuccessForm data={formData} onChange={onChange} />}
        </fieldset>
      </div>
    </section>
  )
}

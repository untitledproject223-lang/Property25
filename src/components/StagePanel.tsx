import type { StageDefinition } from '../stages'
import {
  InquiryForm,
  DocumentsForm,
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

export function StagePanel({ stage, formData, onChange }: StagePanelProps) {
  return (
    <section className={`stage-panel phase-${stage.phase}`} aria-labelledby="stage-heading">
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
        </div>
        <h2 id="stage-heading">{stageHeading(stage, formData)}</h2>
        <p className="stage-desc">{stage.description}</p>
        <p className="stage-optional">All fields are optional — use Next to continue.</p>
      </header>

      <div className="stage-panel-body">
        {stage.id === 'inquiry' && <InquiryForm data={formData} onChange={onChange} />}
        {stage.id === 'documents' && <DocumentsForm data={formData} onChange={onChange} />}
        {stage.id === 'kyc' && <KycForm data={formData} onChange={onChange} />}
        {stage.id === 'payment' && <PaymentForm data={formData} onChange={onChange} />}
        {stage.id === 'lease' && <LeaseForm data={formData} onChange={onChange} />}
        {stage.id === 'completion' && <CompletionForm data={formData} onChange={onChange} />}
        {stage.id === 'movein' && <MoveInForm data={formData} onChange={onChange} />}
      </div>
    </section>
  )
}

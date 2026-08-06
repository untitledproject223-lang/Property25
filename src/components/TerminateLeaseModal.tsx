import { useState, type FormEvent } from 'react'

export type TerminateLeasePayload = {
  reason: string
  depositPaidOut: boolean
  terminationDate: string
}

export default function TerminateLeaseModal({
  tenantName,
  unitLabel,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  tenantName: string
  unitLabel?: string
  busy?: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: (payload: TerminateLeasePayload) => void | Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [depositPaidOut, setDepositPaidOut] = useState(false)
  const [terminationDate, setTerminationDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    await onConfirm({
      reason: reason.trim(),
      depositPaidOut,
      terminationDate,
    })
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminate-lease-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="page-header" style={{ marginBottom: '0.75rem' }}>
          <div>
            <h2 id="terminate-lease-title" style={{ margin: 0 }}>
              Terminate lease
            </h2>
            <p style={{ margin: '0.35rem 0 0' }}>
              {tenantName}
              {unitLabel ? ` · ${unitLabel}` : ''}
            </p>
          </div>
        </header>

        {error ? <p className="login-error">{error}</p> : null}

        <form className="form-stack" onSubmit={(e) => void onSubmit(e)}>
          <label>
            Reason for termination
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="Why is this lease being terminated?"
            />
          </label>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={depositPaidOut}
              onChange={(e) => setDepositPaidOut(e.target.checked)}
            />
            Deposit will be paid out to the tenant
          </label>
          <label>
            Date of termination
            <input
              type="date"
              value={terminationDate}
              onChange={(e) => setTerminationDate(e.target.value)}
              required
            />
          </label>
          <p className="muted">
            After confirmation, the tenant lease ends and the unit becomes available immediately.
          </p>
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={busy || !reason.trim()}>
              {busy ? 'Terminating…' : 'Terminate lease'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

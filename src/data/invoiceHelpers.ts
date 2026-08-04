import type { Invoice, InvoiceItem } from './types'

/** Maintenance tickets where the tenant (or split share) must pay. */
export function isTenantBillableTicket(issue: {
  issueType?: unknown
  decision?: unknown
}) {
  if (String(issue.issueType ?? '') !== 'maintenance') return false
  const decision =
    issue.decision && typeof issue.decision === 'object'
      ? (issue.decision as Record<string, unknown>)
      : {}
  const payer = String(decision.payer ?? '')
  return (
    decision.outcome === 'conditional' && (payer === 'tenant' || payer === 'split')
  )
}

export function tenantMaintenanceAmount(decision: Record<string, unknown>) {
  const total = Number(decision.totalCost ?? 0)
  const payer = String(decision.payer ?? '')
  if (payer === 'split') {
    const share = Number(decision.tenantShare ?? 0)
    return Math.round(total * (share / 100) * 100) / 100
  }
  return total
}

export function ticketInvoiceDescription(subject: string, decision: Record<string, unknown>) {
  const payer = String(decision.payer ?? 'tenant')
  if (payer === 'split') {
    return `Maintenance (tenant share ${Number(decision.tenantShare ?? 0)}%) — ${subject}`
  }
  return `Maintenance — ${subject}`
}

type ReasonSource = {
  notes?: string | null
  billingKind?: string | null
  isRecurring?: boolean | null
  issueId?: string | null
  items?: Array<Pick<InvoiceItem, 'type' | 'description'> | Record<string, unknown>>
  issueSubject?: string | null
}

/** Human-readable reason shown on invoice lists and the document view. */
export function invoiceReason(invoice: ReasonSource | Invoice): string {
  const notes = String(invoice.notes ?? '').trim()
  if (notes) return notes

  if (invoice.issueId) {
    const subject = String(
      'issueSubject' in invoice ? (invoice.issueSubject ?? '') : '',
    ).trim()
    return subject
      ? `Maintenance charge for ticket: ${subject}`
      : 'Maintenance charge linked to a ticket where the tenant is responsible for payment'
  }

  if (invoice.billingKind === 'recurring' || invoice.isRecurring) {
    return 'Recurring rent invoice'
  }

  const items = Array.isArray(invoice.items) ? invoice.items : []
  const types = items.map((item) => String((item as { type?: unknown }).type ?? ''))
  if (types.includes('maintenance')) return 'Maintenance charge'
  if (types.includes('deposit')) return 'Security deposit'
  if (types.includes('admin')) return 'Administration fees'
  if (types.includes('rent')) return 'Rent payment'
  if (items.length === 1) {
    const description = String((items[0] as { description?: unknown }).description ?? '').trim()
    if (description) return description
  }
  if (items.length > 1) return 'Multiple billed items'
  return 'Invoice issued'
}

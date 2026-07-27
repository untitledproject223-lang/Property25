import type { InvoiceStatus, IssueStatus, PaymentStatus } from './types'

export function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(value?: string) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(value?: string) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function paymentBadge(balance: number, nextDueDate?: string): {
  label: string
  tone: 'paid' | 'due' | 'overdue'
} {
  if (balance > 0) {
    if (nextDueDate && new Date(nextDueDate) < new Date()) {
      return { label: 'Overdue', tone: 'overdue' }
    }
    return { label: 'Due', tone: 'due' }
  }
  return { label: 'Paid', tone: 'paid' }
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function phoneDigits(phone: string) {
  return phone.replace(/\D/g, '')
}

export function mailto(email: string, subject?: string, body?: string) {
  const params = new URLSearchParams()
  if (subject) params.set('subject', subject)
  if (body) params.set('body', body)
  const q = params.toString()
  return `mailto:${email}${q ? `?${q}` : ''}`
}

export function whatsappLink(whatsappOrPhone: string, text?: string) {
  const digits = phoneDigits(whatsappOrPhone)
  const q = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${digits}${q}`
}

export function telLink(phone: string) {
  return `tel:${phoneDigits(phone)}`
}

export function statusTone(
  status: InvoiceStatus | IssueStatus | PaymentStatus | string,
): string {
  switch (status) {
    case 'paid':
    case 'resolved':
    case 'active':
      return 'tone-paid'
    case 'sent':
    case 'pending':
    case 'due':
    case 'draft':
    case 'notice':
      return 'tone-due'
    case 'overdue':
    case 'open':
    case 'failed':
    case 'high':
      return 'tone-overdue'
    default:
      return 'tone-neutral'
  }
}

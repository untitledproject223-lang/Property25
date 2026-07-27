import type { ContactChannel } from '../data/types'
import { mailto, telLink, whatsappLink } from '../data/utils'
import { useDashboard } from '../data/DashboardContext'

interface ContactPerson {
  name: string
  email: string
  phone: string
  whatsapp?: string
}

interface ContactActionsProps {
  person: ContactPerson
  tenantId?: string
  landlordId?: string
  subject?: string
  compact?: boolean
}

export function ContactActions({
  person,
  tenantId,
  landlordId,
  subject,
  compact,
}: ContactActionsProps) {
  const { logActivity } = useDashboard()
  const cls = compact ? 'btn btn-ghost btn-compact' : 'btn btn-ghost'

  function track(channel: ContactChannel, body: string) {
    logActivity({
      tenantId,
      landlordId,
      kind: landlordId && !tenantId ? 'landlord_update' : 'contact',
      channel,
      body,
    })
  }

  return (
    <div className="btn-row">
      <a
        className={cls}
        href={mailto(person.email, subject)}
        onClick={() => track('email', `Emailed ${person.name}`)}
      >
        Email
      </a>
      <a
        className={cls}
        href={whatsappLink(person.whatsapp || person.phone, subject)}
        target="_blank"
        rel="noreferrer"
        onClick={() => track('whatsapp', `WhatsApp ${person.name}`)}
      >
        WhatsApp
      </a>
      <a
        className={cls}
        href={telLink(person.phone)}
        onClick={() => track('phone', `Called ${person.name}`)}
      >
        Call
      </a>
    </div>
  )
}

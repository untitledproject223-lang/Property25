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
  /** Kept for compatibility; contact actions are always compact. */
  compact?: boolean
}

export function ContactActions({
  person,
  tenantId,
  landlordId,
  subject,
}: ContactActionsProps) {
  const { logActivity } = useDashboard()

  function track(channel: ContactChannel, body: string) {
    void logActivity({
      tenantId,
      landlordId,
      kind: landlordId && !tenantId ? 'landlord_update' : 'contact',
      channel,
      body,
    })
  }

  return (
    <div className="contact-actions" role="group" aria-label={`Contact ${person.name}`}>
      <a
        className="btn-contact"
        href={mailto(person.email, subject)}
        title={`Email ${person.name}`}
        onClick={() => track('email', `Emailed ${person.name}`)}
      >
        Email
      </a>
      <a
        className="btn-contact"
        href={whatsappLink(person.whatsapp || person.phone, subject)}
        target="_blank"
        rel="noreferrer"
        title={`WhatsApp ${person.name}`}
        onClick={() => track('whatsapp', `WhatsApp ${person.name}`)}
      >
        WA
      </a>
      <a
        className="btn-contact"
        href={telLink(person.phone)}
        title={`Call ${person.name}`}
        onClick={() => track('phone', `Called ${person.name}`)}
      >
        Call
      </a>
    </div>
  )
}

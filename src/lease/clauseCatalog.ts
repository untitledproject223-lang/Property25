import type { ClauseId, LeaseClauseParams, CustomLeaseClause } from './types'

export type ClauseCatalogItem = {
  id: ClauseId
  subject: string
  /** Short hint shown under the subject head in onboarding */
  hint: string
  buildBody: (params: LeaseClauseParams) => string
}

export const CLAUSE_CATALOG: ClauseCatalogItem[] = [
  {
    id: 'noticePeriod',
    subject: 'Notice period before lease end',
    hint: 'How many months’ written notice is required',
    buildBody: (p) => {
      const months = Math.max(1, Number(p.noticeMonths) || 1)
      return `Either party may terminate this lease on expiry of the fixed term by giving the other party at least ${months} calendar month(s) prior written notice. Notice must be in writing and delivered to the domicilium address or email stated in this agreement. If the lease continues on a month-to-month basis after the fixed term, the same notice period shall apply unless otherwise agreed in writing.`
    },
  },
  {
    id: 'pets',
    subject: 'Pets policy',
    hint: 'Allow or prohibit pets on the premises',
    buildBody: (p) => {
      if (p.petsAllowed) {
        const note = p.petsNote?.trim()
        return `The Tenant may keep pets on the Premises only with the Landlord’s prior written consent and subject to any body corporate or homeowners’ association rules. ${
          note ? `Additional conditions: ${note}. ` : ''
        }The Tenant remains fully responsible for any damage, noise, or nuisance caused by pets and must keep the Premises clean and free of pet waste.`
      }
      return `No pets, animals, birds, or reptiles may be kept on or brought onto the Premises without the Landlord’s prior written consent. Any breach of this clause constitutes a material breach of this lease.`
    },
  },
  {
    id: 'smoking',
    subject: 'Smoking policy',
    hint: 'No smoking indoors (and related rules)',
    buildBody: () =>
      `Smoking of tobacco, cannabis, or any other substance is not permitted inside the Premises, including enclosed balconies where applicable. The Tenant shall ensure that visitors comply with this rule. Any smoke-related staining, odour, or damage may be deducted from the deposit after a proper inspection.`,
  },
  {
    id: 'subletting',
    subject: 'No subletting / short-term letting',
    hint: 'Prohibit Airbnb-style or informal sublets',
    buildBody: () =>
      `The Tenant may not cede, assign, sublet, or otherwise part with occupation of the Premises or any part thereof, whether for reward or otherwise, including short-term letting platforms, without the Landlord’s prior written consent. Any unauthorised occupation by a third party is a material breach.`,
  },
  {
    id: 'parking',
    subject: 'Parking bay / allocation',
    hint: 'Optional bay or parking description',
    buildBody: (p) => {
      const bay = p.parkingBay?.trim()
      return bay
        ? `The Tenant is allocated parking as follows: ${bay}. The parking area may only be used for a roadworthy private motor vehicle and may not be used for storage, repairs, or commercial activity. The Landlord does not accept liability for theft of or damage to vehicles or contents, except to the extent caused by the Landlord’s proven negligence.`
        : `Where parking is provided with the Premises, it is for the Tenant’s private use only and remains subject to complex or municipal rules. The Landlord does not accept liability for theft of or damage to vehicles or contents, except to the extent caused by the Landlord’s proven negligence.`
    },
  },
  {
    id: 'occupancyGuests',
    subject: 'Occupancy and overnight guests',
    hint: 'Limit permanent occupants and guest stays',
    buildBody: (p) => {
      const max = Number(p.maxOccupants)
      const cap =
        Number.isFinite(max) && max > 0
          ? `The Premises may not be occupied on a permanent basis by more than ${max} person(s). `
          : ''
      return `${cap}Overnight guests are permitted on a temporary, reasonable basis only. Continuous occupation by persons who are not named as tenants requires the Landlord’s prior written consent.`
    },
  },
  {
    id: 'alterations',
    subject: 'No alterations without consent',
    hint: 'Fixtures, paint, drilling, renovations',
    buildBody: () =>
      `The Tenant may not make any structural or material alterations, additions, or improvements to the Premises (including painting, tiling, flooring, or fixing permanent fixtures) without the Landlord’s prior written consent. Any authorised improvements become the property of the Landlord unless otherwise agreed in writing.`,
  },
  {
    id: 'utilitiesPrepaid',
    subject: 'Prepaid utilities responsibility',
    hint: 'Electricity / water / gas prepaid meters',
    buildBody: () =>
      `Where electricity, water, or gas is supplied through a prepaid meter, the Tenant is solely responsible for purchasing and maintaining sufficient credit. The Landlord is not obliged to supply credit. Disconnection due to the Tenant’s failure to purchase credit does not constitute a breach by the Landlord or a ground for rent reduction.`,
  },
  {
    id: 'earlyTermination',
    subject: 'Early termination / break clause',
    hint: 'Optional early exit terms',
    buildBody: (p) => {
      const months = Math.max(1, Number(p.earlyTerminationMonths) || 1)
      const fee = p.earlyTerminationFee?.trim()
      return `Without prejudice to any rights under applicable law, if the Tenant wishes to terminate this lease before the fixed end date, the Tenant must give at least ${months} calendar month(s) written notice. ${
        fee
          ? `An early termination contribution of ${fee} may be payable, subject to any mandatory consumer-protection limitations. `
          : ''
      }The Landlord may claim proven damages resulting from early termination, mitigated by reasonable efforts to re-let the Premises.`
    },
  },
  {
    id: 'gardenCommon',
    subject: 'Garden / common-area upkeep',
    hint: 'Tenant duties for gardens and shared areas',
    buildBody: () =>
      `Where the Premises include a private garden, patio, or exclusive-use area, the Tenant shall keep it neat, weeded, and free of refuse. Common areas of a complex must be used courteously and in accordance with the rules of the body corporate or homeowners’ association. Refuse must be placed out only on collection days.`,
  },
  {
    id: 'bodyCorporate',
    subject: 'Body corporate / HOA rules',
    hint: 'Tenant bound by scheme rules',
    buildBody: () =>
      `If the Premises form part of a sectional title scheme or homeowners’ association, the Tenant acknowledges that they are bound by the applicable conduct rules, management rules, and any house rules as if they were the owner. A breach of those rules is a breach of this lease. The Tenant must not do anything that may cause the Landlord to incur fines or levies attributable to the Tenant’s conduct.`,
  },
  {
    id: 'insurance',
    subject: 'Tenant contents insurance',
    hint: 'Recommend or require household contents cover',
    buildBody: () =>
      `The Tenant is strongly advised to obtain and maintain household contents insurance covering personal belongings on the Premises. The Landlord’s insurance, if any, does not cover the Tenant’s possessions. The Landlord is not liable for loss of or damage to the Tenant’s goods except to the extent caused by the Landlord’s proven negligence.`,
  },
]

export function clauseById(id: ClauseId): ClauseCatalogItem | undefined {
  return CLAUSE_CATALOG.find((c) => c.id === id)
}

export function buildSelectedClauseSections(
  selectedIds: ClauseId[],
  params: LeaseClauseParams,
  custom: CustomLeaseClause[],
): Array<{ title: string; body: string }> {
  const sections: Array<{ title: string; body: string }> = []
  for (const id of selectedIds) {
    const item = clauseById(id)
    if (!item) continue
    sections.push({ title: item.subject, body: item.buildBody(params) })
  }
  for (const c of custom) {
    if (!c.title.trim() || !c.body.trim()) continue
    sections.push({ title: c.title.trim(), body: c.body.trim() })
  }
  return sections
}

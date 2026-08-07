import type { LeaseComposeFacts } from './types'

/** Escape text for safe insertion into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function line(label: string, value: string) {
  return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value || '—')}</p>`
}

/**
 * Generic South African residential lease template (illustrative / platform default).
 * Not legal advice — parties should obtain independent advice where needed.
 */
export function renderBaseLeaseSections(facts: LeaseComposeFacts): string {
  const f = {
    landlordName: facts.landlordName || 'the Landlord',
    landlordEmail: facts.landlordEmail || '—',
    landlordPhone: facts.landlordPhone || '—',
    tenantName: facts.tenantName || 'the Tenant',
    tenantEmail: facts.tenantEmail || '—',
    tenantPhone: facts.tenantPhone || '—',
    propertyAddress: facts.propertyAddress || 'the Premises',
    unitNumber: facts.unitNumber || '—',
    rent: facts.rent || '—',
    deposit: facts.deposit || '—',
    leaseStart: facts.leaseStart || '—',
    leaseEnd: facts.leaseEnd || '—',
    agreementTermLabel: facts.agreementTermLabel || '—',
    today: facts.today || '—',
  }

  return `
<section class="lease-sec">
  <h2>1. Parties</h2>
  <p>This Residential Lease Agreement (“Agreement”) is entered into on <strong>${escapeHtml(f.today)}</strong> between:</p>
  ${line('Landlord', f.landlordName)}
  ${line('Landlord email', f.landlordEmail)}
  ${line('Landlord phone', f.landlordPhone)}
  <p>and</p>
  ${line('Tenant', f.tenantName)}
  ${line('Tenant email', f.tenantEmail)}
  ${line('Tenant phone', f.tenantPhone)}
  <p>(collectively, the “Parties”).</p>
</section>

<section class="lease-sec">
  <h2>2. Premises</h2>
  <p>The Landlord lets to the Tenant, who hires, the residential premises described as:</p>
  ${line('Address', f.propertyAddress)}
  ${line('Unit', f.unitNumber)}
  <p>(the “Premises”), together with any fixtures, fittings, and keys listed in the move-in inspection record.</p>
</section>

<section class="lease-sec">
  <h2>3. Lease term</h2>
  ${line('Commencement date', f.leaseStart)}
  ${line('Expiry date', f.leaseEnd)}
  ${line('Agreement term', f.agreementTermLabel)}
  <p>Occupation is granted subject to timely payment of rent and compliance with this Agreement. Holding over after expiry without written agreement does not create a new fixed-term lease and may convert to a month-to-month tenancy on the same terms, insofar as permitted by law.</p>
</section>

<section class="lease-sec">
  <h2>4. Rent and payment</h2>
  ${line('Monthly rent (ZAR)', f.rent)}
  <p>Rent is payable monthly in advance on or before the first day of each month into the account nominated by the Landlord (or managing agent), free of deduction or set-off except as required by law. Late payment may attract interest and/or recovery costs to the extent permitted by applicable legislation.</p>
</section>

<section class="lease-sec">
  <h2>5. Deposit</h2>
  ${line('Deposit (ZAR)', f.deposit)}
  <p>The Tenant shall pay the deposit before occupation. The deposit may be applied toward unpaid rent, utilities for which the Tenant is liable, and proven damage beyond fair wear and tear after a proper exit inspection. The balance must be dealt with in accordance with the Rental Housing Act 50 of 1999 (as amended) and any applicable regulations. The deposit does not limit the Landlord’s claim for larger proven losses.</p>
</section>

<section class="lease-sec">
  <h2>6. Utilities and services</h2>
  <p>Unless otherwise agreed in writing, the Tenant is responsible for consumption charges for electricity, water, gas, refuse, and telecommunications attributable to the Premises during the tenancy. Where accounts remain in the Landlord’s name, the Tenant shall reimburse consumption on presentation of proof. Municipal rates and body corporate levies remain the Landlord’s responsibility unless expressly agreed otherwise.</p>
</section>

<section class="lease-sec">
  <h2>7. Tenant’s obligations</h2>
  <ul>
    <li>Pay rent and amounts due under this Agreement on time.</li>
    <li>Use the Premises only as a private dwelling and not for unlawful purposes.</li>
    <li>Keep the Premises clean and in good order, fair wear and tear excepted.</li>
    <li>Not cause nuisance to neighbours or the Landlord.</li>
    <li>Report defects and emergencies promptly to the Landlord or agent.</li>
    <li>Not overload electrical or plumbing systems.</li>
    <li>Return all keys, remotes, and access devices on vacating.</li>
  </ul>
</section>

<section class="lease-sec">
  <h2>8. Landlord’s obligations</h2>
  <ul>
    <li>Give the Tenant peaceful occupation of the Premises, subject to this Agreement.</li>
    <li>Maintain the structure and ensure the Premises are reasonably fit for habitation at commencement.</li>
    <li>Attend to repairs that are the Landlord’s responsibility within a reasonable time after notice.</li>
    <li>Comply with applicable rental housing legislation and any valid tribunal or court order.</li>
  </ul>
</section>

<section class="lease-sec">
  <h2>9. Access and inspections</h2>
  <p>The Landlord or authorised agent may enter the Premises at reasonable times on reasonable prior notice to inspect, effect repairs, or show prospective tenants or purchasers, except in emergencies where notice may be dispensed with. The Parties shall cooperate in completing inbound and outbound inspections.</p>
</section>

<section class="lease-sec">
  <h2>10. Breach and cancellation</h2>
  <p>If either Party breaches a material term and fails to remedy within the period required by law or a written notice (where notice is required), the aggrieved Party may cancel this Agreement and/or claim damages, without prejudice to other remedies. Unlawful lock-outs and self-help eviction are prohibited; recovery of possession must follow due legal process.</p>
</section>

<section class="lease-sec">
  <h2>11. Domicilium and notices</h2>
  <p>The Parties choose the addresses and email addresses stated in clause 1 as their domicilium citandi et executandi for all notices and legal process under this Agreement. Notices in writing delivered by hand, prepaid registered post, or email to those details are deemed received in accordance with ordinary rules of evidence and any applicable statute.</p>
</section>

<section class="lease-sec">
  <h2>12. General</h2>
  <p>This Agreement constitutes the whole agreement between the Parties regarding the Premises. No variation is binding unless in writing and signed or otherwise concluded in a manner recognised by law. If any provision is unenforceable, the remainder remains in force. This Agreement is governed by the laws of the Republic of South Africa. Nothing in this template limits non-waivable rights under the Rental Housing Act, the Consumer Protection Act (where applicable), or other mandatory law.</p>
  <p class="lease-disclaimer"><em>This is a generic platform template for convenience. It is not a substitute for tailored legal advice.</em></p>
</section>
`
}

import { buildSelectedClauseSections } from './clauseCatalog'
import { escapeHtml, renderBaseLeaseSections } from './saRentalTemplate'
import type { LeaseComposeFacts, UnitLeaseConfig } from './types'

export function composeLeaseHtml(
  config: UnitLeaseConfig,
  facts: LeaseComposeFacts,
): string {
  const special = buildSelectedClauseSections(
    config.selectedClauseIds,
    config.clauseParams,
    config.customClauses,
  )

  const specialHtml =
    special.length === 0
      ? ''
      : `
<section class="lease-sec">
  <h2>13. Special conditions</h2>
  <p>The following special conditions form part of this Agreement and prevail over the general clauses above to the extent of any conflict, subject always to mandatory law:</p>
  ${special
    .map(
      (s, i) => `
  <h3>13.${i + 1} ${escapeHtml(s.title)}</h3>
  <p>${escapeHtml(s.body)}</p>`,
    )
    .join('\n')}
</section>`

  const tenantMark = facts.tenantSignatureMark?.startsWith('data:image/')
    ? `<img class="lease-sign-img" src="${facts.tenantSignatureMark}" alt="Tenant signature" />`
    : `<p class="lease-sign-line">Signature / date as captured on the platform</p>`
  const landlordMark = facts.landlordSignatureMark?.startsWith('data:image/')
    ? `<img class="lease-sign-img" src="${facts.landlordSignatureMark}" alt="Landlord signature" />`
    : `<p class="lease-sign-line">Signature / date as captured on the platform</p>`

  const signatureBlock = `
<section class="lease-sec lease-sign-block">
  <h2>Signature</h2>
  <p>By signing electronically below, each Party confirms that they have read and understood this Agreement and agree to be bound by its terms.</p>
  <div class="lease-sign-rows">
    <div>
      <p><strong>Tenant</strong></p>
      <p>${escapeHtml(facts.tenantName || '—')}</p>
      ${facts.tenantSignatureDate ? `<p>Date: ${escapeHtml(facts.tenantSignatureDate)}</p>` : ''}
      ${tenantMark}
    </div>
    <div>
      <p><strong>Landlord</strong></p>
      <p>${escapeHtml(facts.landlordName || '—')}</p>
      ${facts.landlordSignatureDate ? `<p>Date: ${escapeHtml(facts.landlordSignatureDate)}</p>` : ''}
      ${landlordMark}
    </div>
  </div>
</section>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Residential Lease Agreement</title>
<style>
  .lease-doc { font-family: "Georgia", "Times New Roman", serif; color: #1a1a1a; line-height: 1.55; padding: 1.5rem 1.75rem 2.5rem; max-width: 720px; margin: 0 auto; background: #fff; }
  .lease-doc h1 { font-size: 1.35rem; letter-spacing: 0.04em; text-align: center; margin: 0 0 0.35rem; }
  .lease-doc .lease-sub { text-align: center; font-size: 0.85rem; color: #555; margin: 0 0 1.5rem; }
  .lease-sec { margin: 0 0 1.25rem; page-break-inside: avoid; }
  .lease-sec h2 { font-size: 1.05rem; margin: 0 0 0.5rem; border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; }
  .lease-sec h3 { font-size: 0.95rem; margin: 0.85rem 0 0.35rem; }
  .lease-sec p, .lease-sec li { font-size: 0.9rem; margin: 0.35rem 0; }
  .lease-sec ul { margin: 0.35rem 0 0.35rem 1.2rem; padding: 0; }
  .lease-disclaimer { color: #666; font-size: 0.8rem; }
  .lease-sign-rows { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1rem; }
  .lease-sign-line { border-top: 1px solid #999; margin-top: 2.5rem; padding-top: 0.35rem; font-size: 0.8rem; color: #666; }
  .lease-sign-img { display: block; max-width: 100%; max-height: 90px; margin-top: 0.75rem; border: 1px solid #ccc; background: #fff; }
</style>
</head>
<body>
<article class="lease-doc">
  <h1>RESIDENTIAL LEASE AGREEMENT</h1>
  <p class="lease-sub">Republic of South Africa · Platform template</p>
  ${renderBaseLeaseSections(facts)}
  ${specialHtml}
  ${signatureBlock}
</article>
</body>
</html>`
}

export function factsFromApplicationData(
  data: Record<string, unknown>,
): LeaseComposeFacts {
  const str = (key: string) => {
    const v = data[key]
    return typeof v === 'string' ? v : v != null ? String(v) : ''
  }
  const term = str('agreementTerm')
  const termLabel =
    term === '12' ? '12 Months' : term === '24' ? '24 Months' : term === 'other' ? 'Other' : term

  return {
    landlordName: str('landlordName'),
    landlordEmail: str('landlordEmail'),
    landlordPhone: str('landlordPhone'),
    tenantName: str('applicantName'),
    tenantEmail: str('applicantEmail'),
    tenantPhone: str('applicantPhone'),
    propertyAddress: str('propertyAddress') || str('buildingAddress'),
    unitNumber: str('apartmentUnit') || str('unitNumber'),
    rent: str('apartmentAmount') || str('paymentRent'),
    deposit: str('apartmentDeposit') || str('paymentDeposit'),
    leaseStart: str('leaseStartDate') || str('moveInDate'),
    leaseEnd: str('leaseEndDate') || str('termEndDate'),
    agreementTermLabel: termLabel,
    today: new Date().toISOString().slice(0, 10),
    tenantSignatureMark: str('signApplicantMark'),
    tenantSignatureDate: str('signApplicantDate'),
    landlordSignatureMark: str('signLandlordMark'),
    landlordSignatureDate: str('signLandlordDate'),
  }
}

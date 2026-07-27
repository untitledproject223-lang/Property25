import './forms.css'
import { useDashboard } from '../../data/DashboardContext'
import { vacantApartments } from '../../data/unitHelpers'
import { formatMoney } from '../../data/utils'

interface FormProps {
  data: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}

function str(data: Record<string, unknown>, key: string) {
  return typeof data[key] === 'string' ? (data[key] as string) : ''
}

function bool(data: Record<string, unknown>, key: string) {
  return data[key] === true
}

function UnitSelectField({
  data,
  onChange,
}: {
  data: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}) {
  const { state } = useDashboard()
  const vacant = vacantApartments(state.apartments, state.tenants)
  const selectedId = str(data, 'apartmentId')
  const selected = state.apartments.find((a) => a.id === selectedId)
  const building = selected
    ? state.buildings.find((b) => b.id === selected.buildingId)
    : undefined

  function selectUnit(id: string) {
    const apartment = state.apartments.find((a) => a.id === id)
    const b = apartment
      ? state.buildings.find((x) => x.id === apartment.buildingId)
      : undefined
    onChange('apartmentId', id)
    if (apartment && b) {
      onChange('propertyAddress', `${b.address}, Unit ${apartment.unitNumber}`)
      onChange('unitNumber', apartment.unitNumber)
      onChange('apartmentAmount', String(apartment.rent))
      onChange('listingRef', `${b.name}-${apartment.unitNumber}`)
      onChange('amountType', 'monthly-rent')
    } else {
      onChange('propertyAddress', '')
      onChange('unitNumber', '')
      onChange('apartmentAmount', '')
      onChange('listingRef', '')
    }
  }

  return (
    <>
      <label className="field field-span">
        <span className="field-label">Select onboarded unit</span>
        <select
          value={selectedId}
          onChange={(e) => selectUnit(e.target.value)}
        >
          <option value="">Choose a vacant unit…</option>
          {vacant.map((apartment) => {
            const b = state.buildings.find((x) => x.id === apartment.buildingId)
            return (
              <option key={apartment.id} value={apartment.id}>
                {b?.name ?? 'Building'} · Unit {apartment.unitNumber} ·{' '}
                {formatMoney(apartment.rent)}/mo
              </option>
            )
          })}
        </select>
        <span className="field-hint">
          Only vacant (unassigned) units appear here. Onboard more under Units.
        </span>
      </label>
      {selected && building ? (
        <>
          <label className="field field-span">
            <span className="field-label">Property address</span>
            <input type="text" value={building.address} readOnly />
          </label>
          <label className="field">
            <span className="field-label">Unit number</span>
            <input type="text" value={selected.unitNumber} readOnly />
          </label>
          <label className="field">
            <span className="field-label">Monthly rent</span>
            <input type="text" value={formatMoney(selected.rent)} readOnly />
          </label>
          <label className="field">
            <span className="field-label">Deposit</span>
            <input type="text" value={formatMoney(selected.deposit)} readOnly />
          </label>
        </>
      ) : null}
      {vacant.length === 0 ? (
        <p className="section-lead">
          No vacant units available. Add units from the Units menu before starting an
          application.
        </p>
      ) : null}
    </>
  )
}

function FileField({
  id,
  label,
  hint,
  value,
  accept,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: string
  accept?: string
  onChange: (name: string) => void
}) {
  return (
    <label className="field file-field" htmlFor={id}>
      <span className="field-label">{label}</span>
      {hint ? <span className="field-hint">{hint}</span> : null}
      <input
        id={id}
        type="file"
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0]?.name ?? '')}
      />
      {value ? <span className="file-selected">{value}</span> : null}
    </label>
  )
}

function InspectionItem({
  id,
  label,
  data,
  onChange,
}: {
  id: string
  label: string
  data: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}) {
  return (
    <div className="inspection-item">
      <span className="inspection-item-label">{label}</span>
      <select
        value={str(data, `${id}Condition`)}
        onChange={(e) => onChange(`${id}Condition`, e.target.value)}
        aria-label={`${label} condition`}
      >
        <option value="">Condition…</option>
        <option value="excellent">Excellent</option>
        <option value="good">Good</option>
        <option value="fair">Fair</option>
        <option value="poor">Poor / needs repair</option>
        <option value="na">N/A</option>
      </select>
      <input
        type="text"
        value={str(data, `${id}Notes`)}
        onChange={(e) => onChange(`${id}Notes`, e.target.value)}
        placeholder="Notes / defects"
        aria-label={`${label} notes`}
      />
    </div>
  )
}

export function InquiryForm({ data, onChange }: FormProps) {
  return (
    <div className="form-grid">
      <div className="role-callout role-agent" role="note">
        <strong>Editable by agent / realtor only.</strong>
        <span>
          Use this step to open the application with basic applicant and apartment
          details. The tenant completes their finances and documents in the next step.
        </span>
      </div>

      <fieldset className="form-section">
        <legend>Agent / realtor</legend>
        <label className="field">
          <span className="field-label">Agent / realtor name</span>
          <input
            type="text"
            value={str(data, 'agentName')}
            onChange={(e) => onChange('agentName', e.target.value)}
            placeholder="Jane Agent"
          />
        </label>
        <label className="field">
          <span className="field-label">Agency / brokerage</span>
          <input
            type="text"
            value={str(data, 'agency')}
            onChange={(e) => onChange('agency', e.target.value)}
            placeholder="Harbor Realty"
          />
        </label>
        <label className="field">
          <span className="field-label">Agent email</span>
          <input
            type="email"
            value={str(data, 'agentEmail')}
            onChange={(e) => onChange('agentEmail', e.target.value)}
            placeholder="agent@agency.com"
          />
        </label>
        <label className="field">
          <span className="field-label">Agent phone</span>
          <input
            type="tel"
            value={str(data, 'agentPhone')}
            onChange={(e) => onChange('agentPhone', e.target.value)}
            placeholder="+1 (555) 010-1000"
          />
        </label>
      </fieldset>

      <fieldset className="form-section">
        <legend>Applicant contact details</legend>
        <label className="field">
          <span className="field-label">Full name</span>
          <input
            type="text"
            value={str(data, 'applicantName')}
            onChange={(e) => onChange('applicantName', e.target.value)}
            placeholder="Alex Morgan"
          />
        </label>
        <label className="field">
          <span className="field-label">Email</span>
          <input
            type="email"
            value={str(data, 'applicantEmail')}
            onChange={(e) => onChange('applicantEmail', e.target.value)}
            placeholder="alex@example.com"
          />
        </label>
        <label className="field">
          <span className="field-label">Phone</span>
          <input
            type="tel"
            value={str(data, 'applicantPhone')}
            onChange={(e) => onChange('applicantPhone', e.target.value)}
            placeholder="+1 (555) 010-2000"
          />
        </label>
        <label className="field">
          <span className="field-label">Preferred contact method</span>
          <select
            value={str(data, 'preferredContact')}
            onChange={(e) => onChange('preferredContact', e.target.value)}
          >
            <option value="">Select…</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Number of applicants / occupants</span>
          <input
            type="number"
            min={1}
            value={str(data, 'occupantCount')}
            onChange={(e) => onChange('occupantCount', e.target.value)}
            placeholder="1"
          />
        </label>
        <label className="field">
          <span className="field-label">Move-in / start date</span>
          <input
            type="date"
            value={str(data, 'moveInDate')}
            onChange={(e) => onChange('moveInDate', e.target.value)}
          />
        </label>
      </fieldset>

      <fieldset className="form-section">
        <legend>Unit & agreement</legend>
        <UnitSelectField data={data} onChange={onChange} />
        <label className="field">
          <span className="field-label">Agreement term</span>
          <input
            type="text"
            value={str(data, 'agreementTerm')}
            onChange={(e) => onChange('agreementTerm', e.target.value)}
            placeholder="12 months"
          />
        </label>
        <label className="field">
          <span className="field-label">Term end date</span>
          <input
            type="date"
            value={str(data, 'termEndDate')}
            onChange={(e) => onChange('termEndDate', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Application type</span>
          <select
            value={str(data, 'applicationType')}
            onChange={(e) => onChange('applicationType', e.target.value)}
          >
            <option value="">Select…</option>
            <option value="rental">Rental</option>
            <option value="lease-to-own">Lease to own</option>
          </select>
        </label>
        <label className="field field-span">
          <span className="field-label">Additional notes</span>
          <textarea
            rows={3}
            value={str(data, 'applicationNotes')}
            onChange={(e) => onChange('applicationNotes', e.target.value)}
            placeholder="Any other basic details about the applicant…"
          />
        </label>
      </fieldset>
    </div>
  )
}

export function DocumentsForm({ data, onChange }: FormProps) {
  return (
    <div className="form-grid">
      <div className="role-callout role-applicant" role="note">
        <strong>Editable by applicant / tenant only.</strong>
        <span>
          Complete your income, monthly expenses, and document uploads. The agent
          cannot edit this step.
        </span>
      </div>

      <fieldset className="form-section">
        <legend>Income</legend>
        <label className="field">
          <span className="field-label">Gross salary (monthly)</span>
          <input
            type="number"
            min={0}
            value={str(data, 'grossSalary')}
            onChange={(e) => onChange('grossSalary', e.target.value)}
            placeholder="6500"
          />
        </label>
        <label className="field">
          <span className="field-label">Employer / income source</span>
          <input
            type="text"
            value={str(data, 'employer')}
            onChange={(e) => onChange('employer', e.target.value)}
            placeholder="Company name"
          />
        </label>
        <label className="field">
          <span className="field-label">Employment status</span>
          <select
            value={str(data, 'employmentStatus')}
            onChange={(e) => onChange('employmentStatus', e.target.value)}
          >
            <option value="">Select…</option>
            <option value="employed">Employed</option>
            <option value="self-employed">Self-employed</option>
            <option value="retired">Retired</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Other monthly income</span>
          <input
            type="number"
            min={0}
            value={str(data, 'otherIncome')}
            onChange={(e) => onChange('otherIncome', e.target.value)}
            placeholder="0"
          />
        </label>
      </fieldset>

      <fieldset className="form-section">
        <legend>Monthly expenses</legend>
        <p className="section-lead">Enter typical monthly amounts for each expense.</p>
        <label className="field">
          <span className="field-label">Current rent / bond</span>
          <input
            type="number"
            min={0}
            value={str(data, 'expenseRentBond')}
            onChange={(e) => onChange('expenseRentBond', e.target.value)}
            placeholder="1800"
          />
        </label>
        <label className="field">
          <span className="field-label">Car (finance / lease / running)</span>
          <input
            type="number"
            min={0}
            value={str(data, 'expenseCar')}
            onChange={(e) => onChange('expenseCar', e.target.value)}
            placeholder="450"
          />
        </label>
        <label className="field">
          <span className="field-label">Phone contract</span>
          <input
            type="number"
            min={0}
            value={str(data, 'expensePhone')}
            onChange={(e) => onChange('expensePhone', e.target.value)}
            placeholder="80"
          />
        </label>
        <label className="field">
          <span className="field-label">Credit repayment</span>
          <input
            type="number"
            min={0}
            value={str(data, 'expenseCredit')}
            onChange={(e) => onChange('expenseCredit', e.target.value)}
            placeholder="200"
          />
        </label>
        <label className="field">
          <span className="field-label">Other loans</span>
          <input
            type="number"
            min={0}
            value={str(data, 'expenseOtherLoans')}
            onChange={(e) => onChange('expenseOtherLoans', e.target.value)}
            placeholder="150"
          />
        </label>
        <label className="field">
          <span className="field-label">Other monthly expenses</span>
          <input
            type="number"
            min={0}
            value={str(data, 'expenseOther')}
            onChange={(e) => onChange('expenseOther', e.target.value)}
            placeholder="0"
          />
        </label>
        <label className="field field-span">
          <span className="field-label">Expense notes</span>
          <textarea
            rows={3}
            value={str(data, 'expenseNotes')}
            onChange={(e) => onChange('expenseNotes', e.target.value)}
            placeholder="Briefly describe any other loans or recurring costs…"
          />
        </label>
      </fieldset>

      <fieldset className="form-section">
        <legend>Supporting documents</legend>
        <p className="section-lead">
          Upload files for each category. All uploads are optional for navigation.
        </p>
        <FileField
          id="idDocs"
          label="1. ID documents"
          hint="Passport, driver's license, or national ID"
          value={str(data, 'idDocs')}
          onChange={(name) => onChange('idDocs', name)}
        />
        <FileField
          id="incomeDocs"
          label="2. Income documents"
          hint="Pay stubs, tax returns, or employment letter"
          value={str(data, 'incomeDocs')}
          onChange={(name) => onChange('incomeDocs', name)}
        />
        <FileField
          id="propertyDocs"
          label="3. Property documents"
          hint="Offer letter, listing sheet, or related property paperwork"
          value={str(data, 'propertyDocs')}
          onChange={(name) => onChange('propertyDocs', name)}
        />
        <FileField
          id="assetDocs"
          label="4. Assets / bank statements"
          hint="Recent bank or investment statements"
          value={str(data, 'assetDocs')}
          onChange={(name) => onChange('assetDocs', name)}
        />
        <FileField
          id="creditDocs"
          label="5. Credit documents"
          hint="Credit authorization or existing report"
          value={str(data, 'creditDocs')}
          onChange={(name) => onChange('creditDocs', name)}
        />
      </fieldset>

      <fieldset className="form-section">
        <legend>Consent & submission</legend>
        <label className="check-field">
          <input
            type="checkbox"
            checked={bool(data, 'creditCheckConsent')}
            onChange={(e) => onChange('creditCheckConsent', e.target.checked)}
          />
          <span>
            I consent to the system administrator running an identity (KYC) and credit
            check as part of this application
          </span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={bool(data, 'docsSubmitted')}
            onChange={(e) => onChange('docsSubmitted', e.target.checked)}
          />
          <span>I confirm my details and documents are ready for first review</span>
        </label>
        <label className="field field-span">
          <span className="field-label">Submission notes</span>
          <textarea
            rows={3}
            value={str(data, 'docsNotes')}
            onChange={(e) => onChange('docsNotes', e.target.value)}
            placeholder="Anything the review team should know…"
          />
        </label>
      </fieldset>
    </div>
  )
}

export function KycForm({ data, onChange }: FormProps) {
  const applicant = str(data, 'applicantName') || 'the applicant'

  return (
    <div className="form-grid">
      <div className="kyc-report-banner">
        <p className="kyc-report-title">KYC report for {applicant}</p>
        <p className="kyc-report-sub">
          Identity and credit results for this application. Agent and landlord must
          both approve to continue.
        </p>
      </div>

      <fieldset className="form-section">
        <legend>Identity verification</legend>
        <label className="field">
          <span className="field-label">KYC status</span>
          <select
            value={str(data, 'kycStatus')}
            onChange={(e) => onChange('kycStatus', e.target.value)}
          >
            <option value="">Select…</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Verification reference ID</span>
          <input
            type="text"
            value={str(data, 'kycRef')}
            onChange={(e) => onChange('kycRef', e.target.value)}
            placeholder="KYC-…"
          />
        </label>
        <label className="field">
          <span className="field-label">ID type verified</span>
          <input
            type="text"
            value={str(data, 'kycIdType')}
            onChange={(e) => onChange('kycIdType', e.target.value)}
            placeholder="Passport / national ID"
          />
        </label>
        <label className="field">
          <span className="field-label">Check completed on</span>
          <input
            type="date"
            value={str(data, 'kycDate')}
            onChange={(e) => onChange('kycDate', e.target.value)}
          />
        </label>
      </fieldset>

      <fieldset className="form-section">
        <legend>Credit check</legend>
        <label className="field">
          <span className="field-label">Credit score</span>
          <input
            type="number"
            min={300}
            max={850}
            value={str(data, 'creditScore')}
            onChange={(e) => onChange('creditScore', e.target.value)}
            placeholder="720"
          />
        </label>
        <label className="field">
          <span className="field-label">Bureau pull date</span>
          <input
            type="date"
            value={str(data, 'creditPullDate')}
            onChange={(e) => onChange('creditPullDate', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Credit recommendation</span>
          <select
            value={str(data, 'creditRecommendation')}
            onChange={(e) => onChange('creditRecommendation', e.target.value)}
          >
            <option value="">Select…</option>
            <option value="approve">Approve</option>
            <option value="review">Needs review</option>
            <option value="decline">Decline</option>
          </select>
        </label>
        <label className="field field-span">
          <span className="field-label">Report summary</span>
          <textarea
            rows={4}
            value={str(data, 'kycSummary')}
            onChange={(e) => onChange('kycSummary', e.target.value)}
            placeholder="Summary of identity and credit findings…"
          />
        </label>
        <FileField
          id="kycReportFile"
          label="Attach KYC / credit report"
          accept=".pdf,image/*"
          value={str(data, 'kycReportFile')}
          onChange={(name) => onChange('kycReportFile', name)}
        />
      </fieldset>

      <fieldset className="form-section">
        <legend>Approvals</legend>
        <label className="check-field">
          <input
            type="checkbox"
            checked={bool(data, 'agentKycApproved')}
            onChange={(e) => onChange('agentKycApproved', e.target.checked)}
          />
          <span>Agent approves this KYC report and recommends proceeding</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={bool(data, 'landlordKycApproved')}
            onChange={(e) => onChange('landlordKycApproved', e.target.checked)}
          />
          <span>Landlord approves this KYC report and accepts the applicant</span>
        </label>
      </fieldset>
    </div>
  )
}

export function PaymentForm({ data, onChange }: FormProps) {
  return (
    <div className="form-grid">
      <div className="role-callout role-applicant" role="note">
        <strong>Payment required from the tenant.</strong>
        <span>
          Pay the deposit, rent, and admin fees using the banking details below, then
          upload proof of payment.
        </span>
      </div>

      <div className="banking-card">
        <h3>Banking details for this rental unit</h3>
        <dl className="banking-details">
          <div>
            <dt>Account name</dt>
            <dd>
              <input
                type="text"
                value={str(data, 'bankAccountName') || 'Property Trust Account'}
                onChange={(e) => onChange('bankAccountName', e.target.value)}
              />
            </dd>
          </div>
          <div>
            <dt>Bank</dt>
            <dd>
              <input
                type="text"
                value={str(data, 'bankName') || 'First National Bank'}
                onChange={(e) => onChange('bankName', e.target.value)}
              />
            </dd>
          </div>
          <div>
            <dt>Account number</dt>
            <dd>
              <input
                type="text"
                value={str(data, 'bankAccountNumber') || '6284017392'}
                onChange={(e) => onChange('bankAccountNumber', e.target.value)}
              />
            </dd>
          </div>
          <div>
            <dt>Branch code</dt>
            <dd>
              <input
                type="text"
                value={str(data, 'bankBranchCode') || '250655'}
                onChange={(e) => onChange('bankBranchCode', e.target.value)}
              />
            </dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>
              <input
                type="text"
                value={
                  str(data, 'bankReference') ||
                  str(data, 'listingRef') ||
                  str(data, 'unitNumber') ||
                  'UNIT-REF'
                }
                onChange={(e) => onChange('bankReference', e.target.value)}
              />
            </dd>
          </div>
        </dl>
        <p className="banking-hint">
          Use the reference above so the payment can be matched to this apartment.
        </p>
      </div>

      <fieldset className="form-section">
        <legend>Amounts to pay</legend>
        <label className="field">
          <span className="field-label">Deposit</span>
          <input
            type="number"
            min={0}
            value={str(data, 'paymentDeposit')}
            onChange={(e) => onChange('paymentDeposit', e.target.value)}
            placeholder="4800"
          />
        </label>
        <label className="field">
          <span className="field-label">Rent</span>
          <input
            type="number"
            min={0}
            value={str(data, 'paymentRent')}
            onChange={(e) => onChange('paymentRent', e.target.value)}
            placeholder={str(data, 'apartmentAmount') || '2400'}
          />
        </label>
        <label className="field">
          <span className="field-label">Admin fees</span>
          <input
            type="number"
            min={0}
            value={str(data, 'paymentAdminFees')}
            onChange={(e) => onChange('paymentAdminFees', e.target.value)}
            placeholder="350"
          />
        </label>
        <label className="field">
          <span className="field-label">Total paid</span>
          <input
            type="number"
            min={0}
            value={str(data, 'paymentTotal')}
            onChange={(e) => onChange('paymentTotal', e.target.value)}
            placeholder="7550"
          />
        </label>
        <label className="field">
          <span className="field-label">Payment date</span>
          <input
            type="date"
            value={str(data, 'paymentDate')}
            onChange={(e) => onChange('paymentDate', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Payment method</span>
          <select
            value={str(data, 'paymentMethod')}
            onChange={(e) => onChange('paymentMethod', e.target.value)}
          >
            <option value="">Select…</option>
            <option value="eft">EFT / bank transfer</option>
            <option value="card">Card</option>
            <option value="cash">Cash deposit</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="form-section">
        <legend>Proof of payment</legend>
        <FileField
          id="proofOfPayment"
          label="Upload proof of payment"
          hint="Bank receipt, screenshot, or PDF confirmation"
          accept=".pdf,image/*"
          value={str(data, 'proofOfPayment')}
          onChange={(name) => onChange('proofOfPayment', name)}
        />
        <label className="check-field">
          <input
            type="checkbox"
            checked={bool(data, 'paymentConfirmed')}
            onChange={(e) => onChange('paymentConfirmed', e.target.checked)}
          />
          <span>I confirm deposit, rent, and admin fees have been paid</span>
        </label>
        <label className="field field-span">
          <span className="field-label">Payment notes</span>
          <textarea
            rows={3}
            value={str(data, 'paymentNotes')}
            onChange={(e) => onChange('paymentNotes', e.target.value)}
            placeholder="Transaction reference or other payment details…"
          />
        </label>
      </fieldset>
    </div>
  )
}

export function LeaseForm({ data, onChange }: FormProps) {
  return (
    <div className="form-grid">
      <div className="role-callout role-shared" role="note">
        <strong>Lease signing — all parties.</strong>
        <span>
          Upload or review the lease PDF, then the applicant, landlord, and agent each
          sign online below.
        </span>
      </div>

      <fieldset className="form-section">
        <legend>Lease document</legend>
        <FileField
          id="leasePdf"
          label="Lease agreement (PDF)"
          hint="Upload the lease PDF to be signed"
          accept=".pdf,application/pdf"
          value={str(data, 'leasePdf')}
          onChange={(name) => onChange('leasePdf', name)}
        />
        <label className="field">
          <span className="field-label">Lease start date</span>
          <input
            type="date"
            value={str(data, 'leaseStartDate') || str(data, 'moveInDate')}
            onChange={(e) => onChange('leaseStartDate', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Lease end date</span>
          <input
            type="date"
            value={str(data, 'leaseEndDate') || str(data, 'termEndDate')}
            onChange={(e) => onChange('leaseEndDate', e.target.value)}
          />
        </label>
      </fieldset>

      <div className="pdf-signer">
        <div className="pdf-preview" aria-label="Lease PDF preview">
          <div className="pdf-preview-header">
            <span>Lease agreement</span>
            <span className="pdf-file-name">
              {str(data, 'leasePdf') || 'No PDF uploaded yet'}
            </span>
          </div>
          <div className="pdf-preview-body">
            <p className="pdf-doc-title">RESIDENTIAL LEASE AGREEMENT</p>
            <p>
              Property:{' '}
              <strong>{str(data, 'propertyAddress') || 'Apartment address'}</strong>
            </p>
            <p>
              Tenant: <strong>{str(data, 'applicantName') || 'Applicant name'}</strong>
            </p>
            <p>
              Term: <strong>{str(data, 'agreementTerm') || '—'}</strong>
            </p>
            <p className="pdf-preview-note">
              Preview placeholder — in production this area shows the uploaded PDF for
              on-screen review before signing.
            </p>
          </div>
        </div>

        <div className="signature-grid">
          <fieldset className="signature-block">
            <legend>Applicant signature</legend>
            <label className="field">
              <span className="field-label">Full legal name</span>
              <input
                type="text"
                value={str(data, 'signApplicantName')}
                onChange={(e) => onChange('signApplicantName', e.target.value)}
                placeholder={str(data, 'applicantName') || 'Tenant full name'}
              />
            </label>
            <label className="field">
              <span className="field-label">Date signed</span>
              <input
                type="date"
                value={str(data, 'signApplicantDate')}
                onChange={(e) => onChange('signApplicantDate', e.target.value)}
              />
            </label>
            <label className="field field-span">
              <span className="field-label">Type signature</span>
              <input
                className="signature-input"
                type="text"
                value={str(data, 'signApplicantMark')}
                onChange={(e) => onChange('signApplicantMark', e.target.value)}
                placeholder="Sign by typing your name"
              />
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={bool(data, 'signApplicantDone')}
                onChange={(e) => onChange('signApplicantDone', e.target.checked)}
              />
              <span>Applicant has signed the lease PDF</span>
            </label>
          </fieldset>

          <fieldset className="signature-block">
            <legend>Landlord signature</legend>
            <label className="field">
              <span className="field-label">Full legal name</span>
              <input
                type="text"
                value={str(data, 'signLandlordName')}
                onChange={(e) => onChange('signLandlordName', e.target.value)}
                placeholder="Landlord full name"
              />
            </label>
            <label className="field">
              <span className="field-label">Date signed</span>
              <input
                type="date"
                value={str(data, 'signLandlordDate')}
                onChange={(e) => onChange('signLandlordDate', e.target.value)}
              />
            </label>
            <label className="field field-span">
              <span className="field-label">Type signature</span>
              <input
                className="signature-input"
                type="text"
                value={str(data, 'signLandlordMark')}
                onChange={(e) => onChange('signLandlordMark', e.target.value)}
                placeholder="Sign by typing your name"
              />
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={bool(data, 'signLandlordDone')}
                onChange={(e) => onChange('signLandlordDone', e.target.checked)}
              />
              <span>Landlord has signed the lease PDF</span>
            </label>
          </fieldset>

          <fieldset className="signature-block">
            <legend>Agent signature</legend>
            <label className="field">
              <span className="field-label">Full legal name</span>
              <input
                type="text"
                value={str(data, 'signAgentName')}
                onChange={(e) => onChange('signAgentName', e.target.value)}
                placeholder={str(data, 'agentName') || 'Agent full name'}
              />
            </label>
            <label className="field">
              <span className="field-label">Date signed</span>
              <input
                type="date"
                value={str(data, 'signAgentDate')}
                onChange={(e) => onChange('signAgentDate', e.target.value)}
              />
            </label>
            <label className="field field-span">
              <span className="field-label">Type signature</span>
              <input
                className="signature-input"
                type="text"
                value={str(data, 'signAgentMark')}
                onChange={(e) => onChange('signAgentMark', e.target.value)}
                placeholder="Sign by typing your name"
              />
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={bool(data, 'signAgentDone')}
                onChange={(e) => onChange('signAgentDone', e.target.checked)}
              />
              <span>Agent has signed the lease PDF</span>
            </label>
          </fieldset>
        </div>
      </div>
    </div>
  )
}

export function CompletionForm({ data, onChange }: FormProps) {
  return (
    <div className="form-grid">
      <div className="completion-summary">
        <h3>Application process complete</h3>
        <p>
          Confirm that all prior steps are done and the tenancy is ready to proceed to
          move-in inspection.
        </p>
      </div>

      <fieldset className="form-section">
        <legend>Completion checklist</legend>
        <label className="check-field">
          <input
            type="checkbox"
            checked={bool(data, 'completeInquiry')}
            onChange={(e) => onChange('completeInquiry', e.target.checked)}
          />
          <span>Application details captured by agent</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={bool(data, 'completeDocs')}
            onChange={(e) => onChange('completeDocs', e.target.checked)}
          />
          <span>Applicant documents and consent received</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={bool(data, 'completeKyc')}
            onChange={(e) => onChange('completeKyc', e.target.checked)}
          />
          <span>KYC approved by agent and landlord</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={bool(data, 'completePayment')}
            onChange={(e) => onChange('completePayment', e.target.checked)}
          />
          <span>Deposit, rent, and admin fees received with proof</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={bool(data, 'completeLease')}
            onChange={(e) => onChange('completeLease', e.target.checked)}
          />
          <span>Lease signed by applicant, landlord, and agent</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={bool(data, 'applicationComplete')}
            onChange={(e) => onChange('applicationComplete', e.target.checked)}
          />
          <span>Application process marked complete</span>
        </label>
        <label className="field">
          <span className="field-label">Completion date</span>
          <input
            type="date"
            value={str(data, 'completionDate')}
            onChange={(e) => onChange('completionDate', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Confirmed by</span>
          <input
            type="text"
            value={str(data, 'completionBy')}
            onChange={(e) => onChange('completionBy', e.target.value)}
            placeholder={str(data, 'agentName') || 'Agent name'}
          />
        </label>
        <label className="field field-span">
          <span className="field-label">Final notes</span>
          <textarea
            rows={3}
            value={str(data, 'completionNotes')}
            onChange={(e) => onChange('completionNotes', e.target.value)}
            placeholder="Any remaining remarks before move-in…"
          />
        </label>
      </fieldset>
    </div>
  )
}

const INSPECTION_ITEMS = [
  { id: 'inspEntrance', label: 'Entrance / front door & locks' },
  { id: 'inspWalls', label: 'Walls & paintwork' },
  { id: 'inspCeilings', label: 'Ceilings' },
  { id: 'inspFloors', label: 'Floors / carpets / tiles' },
  { id: 'inspWindows', label: 'Windows, frames & glass' },
  { id: 'inspDoors', label: 'Interior doors & handles' },
  { id: 'inspKitchen', label: 'Kitchen (cupboards, counters, sink)' },
  { id: 'inspAppliances', label: 'Appliances (stove, fridge, etc.)' },
  { id: 'inspBathroom', label: 'Bathroom / toilet / shower' },
  { id: 'inspPlumbing', label: 'Plumbing & water pressure' },
  { id: 'inspElectrical', label: 'Electrical / lights / plugs' },
  { id: 'inspBedrooms', label: 'Bedrooms' },
  { id: 'inspLiving', label: 'Living / dining areas' },
  { id: 'inspBalcony', label: 'Balcony / outdoor areas' },
  { id: 'inspKeys', label: 'Keys, remotes & access tags' },
  { id: 'inspMeters', label: 'Meters (electricity / water / gas)' },
  { id: 'inspFurniture', label: 'Furniture & fittings (if furnished)' },
  { id: 'inspCleanliness', label: 'Overall cleanliness' },
]

export function MoveInForm({ data, onChange }: FormProps) {
  return (
    <div className="form-grid">
      <div className="role-callout role-agent" role="note">
        <strong>Move-in inspection — agent / realtor.</strong>
        <span>
          Record the apartment condition before the tenant moves in. This baseline is
          compared with the move-out inspection later.
        </span>
      </div>

      <fieldset className="form-section">
        <legend>Inspection details</legend>
        <label className="field">
          <span className="field-label">Inspection date</span>
          <input
            type="date"
            value={str(data, 'inspectionDate')}
            onChange={(e) => onChange('inspectionDate', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Inspecting agent</span>
          <input
            type="text"
            value={str(data, 'inspectionAgent') || str(data, 'agentName')}
            onChange={(e) => onChange('inspectionAgent', e.target.value)}
            placeholder="Agent name"
          />
        </label>
        <label className="field">
          <span className="field-label">Tenant present</span>
          <select
            value={str(data, 'tenantPresent')}
            onChange={(e) => onChange('tenantPresent', e.target.value)}
          >
            <option value="">Select…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Meter reading — electricity</span>
          <input
            type="text"
            value={str(data, 'meterElectric')}
            onChange={(e) => onChange('meterElectric', e.target.value)}
            placeholder="Reading"
          />
        </label>
        <label className="field">
          <span className="field-label">Meter reading — water</span>
          <input
            type="text"
            value={str(data, 'meterWater')}
            onChange={(e) => onChange('meterWater', e.target.value)}
            placeholder="Reading"
          />
        </label>
        <label className="field">
          <span className="field-label">Meter reading — gas</span>
          <input
            type="text"
            value={str(data, 'meterGas')}
            onChange={(e) => onChange('meterGas', e.target.value)}
            placeholder="Reading / N/A"
          />
        </label>
      </fieldset>

      <fieldset className="form-section inspection-section">
        <legend>Apartment condition checklist</legend>
        <p className="section-lead">
          Rate each item and note any defects. This record is the move-in baseline.
        </p>
        <div className="inspection-list">
          {INSPECTION_ITEMS.map((item) => (
            <InspectionItem
              key={item.id}
              id={item.id}
              label={item.label}
              data={data}
              onChange={onChange}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>Photos & sign-off</legend>
        <FileField
          id="inspectionPhotos"
          label="Move-in photos"
          hint="Upload photos of rooms and any defects"
          accept="image/*,.pdf"
          value={str(data, 'inspectionPhotos')}
          onChange={(name) => onChange('inspectionPhotos', name)}
        />
        <label className="field field-span">
          <span className="field-label">General comments</span>
          <textarea
            rows={4}
            value={str(data, 'inspectionNotes')}
            onChange={(e) => onChange('inspectionNotes', e.target.value)}
            placeholder="Overall condition summary, outstanding issues, keys handed over…"
          />
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={bool(data, 'inspectionAgentSigned')}
            onChange={(e) => onChange('inspectionAgentSigned', e.target.checked)}
          />
          <span>Agent confirms this move-in inspection is accurate</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={bool(data, 'inspectionTenantSigned')}
            onChange={(e) => onChange('inspectionTenantSigned', e.target.checked)}
          />
          <span>Tenant acknowledges the recorded condition of the apartment</span>
        </label>
      </fieldset>
    </div>
  )
}

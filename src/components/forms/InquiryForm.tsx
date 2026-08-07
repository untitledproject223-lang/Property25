import { useEffect, useState } from 'react'
import './forms.css'
import { useAuth } from '../../data/AuthContext'
import { useDashboard } from '../../data/DashboardContext'
import { vacantApartments } from '../../data/unitHelpers'
import { formatMoney } from '../../data/utils'
import {
  fetchApartment,
  fetchLandlordPortfolio,
  fileToBase64,
  uploadDocument,
  type AuthRole,
} from '../../data/api'
import {
  composeLeaseHtml,
  factsFromApplicationData,
  parseLeaseConfig,
  type UnitLeaseConfig,
} from '../../lease'
import { SignaturePad } from '../SignaturePad'
import { isLandlordInitiated, leaseSignatureStatuses, moveInSignStatuses } from '../../stages'

/** Default admin / KYC check fee when a unit is selected (ZAR). */
const DEFAULT_ADMIN_FEE = '350'

interface FormProps {
  data: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  viewerRole?: AuthRole
}

function str(data: Record<string, unknown>, key: string) {
  return typeof data[key] === 'string' ? (data[key] as string) : ''
}

function bool(data: Record<string, unknown>, key: string) {
  const value = data[key]
  return value === true || value === 'true' || value === 1 || value === '1'
}

/** Add whole months to a YYYY-MM-DD date, clamping to the last day of the target month. */
function addMonthsToIsoDate(dateStr: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  if (!match) return ''
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!year || !month || !day) return ''

  const base = new Date(year, month - 1, 1)
  base.setMonth(base.getMonth() + months)
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  base.setDate(Math.min(day, lastDay))

  const y = base.getFullYear()
  const m = String(base.getMonth() + 1).padStart(2, '0')
  const d = String(base.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function termMonthsFromAgreement(term: string): 12 | 24 | null {
  if (term === '12') return 12
  if (term === '24') return 24
  return null
}

async function persistUpload(
  data: Record<string, unknown>,
  docType: string,
  file: File,
) {
  const applicationId = str(data, 'applicationId') || null
  const tenantId = str(data, 'tenantId') || null
  if (!applicationId && !tenantId) {
    throw new Error('Save applicant details first so documents can be stored.')
  }
  const contentBase64 = await fileToBase64(file)
  await uploadDocument({
    applicationId,
    tenantId,
    docType,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    contentBase64,
  })
}

function makeMultiFileHandler(
  data: Record<string, unknown>,
  onChange: (key: string, value: unknown) => void,
  fieldKey: string,
  docType: string,
) {
  return async (fileList: FileList | null) => {
    if (!fileList?.length) return
    const files = Array.from(fileList)
    const existing = fileNames(data, fieldKey)
    onChange(`${fieldKey}Uploading`, true)
    onChange(`${fieldKey}Error`, '')
    const uploaded = [...existing]
    try {
      for (const file of files) {
        await persistUpload(data, docType, file)
        uploaded.push(file.name)
        onChange(fieldKey, uploaded)
      }
    } catch (err) {
      onChange(
        `${fieldKey}Error`,
        err instanceof Error ? err.message : 'Upload failed',
      )
    } finally {
      onChange(`${fieldKey}Uploading`, false)
    }
  }
}

function fileNames(data: Record<string, unknown>, key: string): string[] {
  const value = data[key]
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/\n|,/)
      .map((part) => part.trim())
      .filter(Boolean)
  }
  return []
}

function UnitSelectField({
  data,
  onChange,
}: {
  data: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}) {
  const { user } = useAuth()
  const { state } = useDashboard()
  const landlordLocked = isLandlordInitiated(data) || user?.role === 'landlord'
  const [portfolioLoaded, setPortfolioLoaded] = useState(false)
  const [landlordProfile, setLandlordProfile] = useState<{
    id: string
    name: string
  } | null>(null)
  const [landlordUnits, setLandlordUnits] = useState<
    Array<{
      id: string
      unitNumber: string
      rent: number
      deposit: number
      buildingName: string
      buildingAddress: string
      landlordId?: string
      landlordName?: string
      tenantId?: string | null
    }>
  >([])

  useEffect(() => {
    if (user?.role !== 'landlord') return
    let cancelled = false
    fetchLandlordPortfolio()
      .then((r) => {
        if (cancelled) return
        const landlord = r.data.landlord
        const id = landlord?.id ? String(landlord.id) : ''
        const name = landlord?.name ? String(landlord.name) : user?.name || 'You'
        if (id) {
          setLandlordProfile({ id, name })
        }
        const units = (r.data.units ?? []).map((u) => ({
          id: String(u.id),
          unitNumber: String(u.unitNumber ?? ''),
          rent: Number(u.rent) || 0,
          deposit: Number(u.deposit) || 0,
          buildingName: String(u.buildingName ?? ''),
          buildingAddress: String(u.buildingAddress ?? ''),
          landlordId: id || undefined,
          landlordName: name,
          tenantId: u.tenantId ? String(u.tenantId) : null,
        }))
        setLandlordUnits(units)
        setPortfolioLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setPortfolioLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [user?.role, user?.name])

  // Keep form data in sync with the signed-in landlord profile (even if field updates
  // were previously blocked while the step was still unlocking).
  useEffect(() => {
    if (!landlordProfile) return
    if (str(data, 'landlordId') !== landlordProfile.id) {
      onChange('landlordId', landlordProfile.id)
    }
    if (str(data, 'landlordName') !== landlordProfile.name) {
      onChange('landlordName', landlordProfile.name)
    }
    if (user?.role === 'landlord' && str(data, 'initiatedBy') !== 'landlord') {
      onChange('initiatedBy', 'landlord')
    }
    // Intentionally depend on profile + current ids only to avoid update loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    landlordProfile,
    data.landlordId,
    data.landlordName,
    data.initiatedBy,
    user?.role,
  ])

  const landlordId = str(data, 'landlordId') || landlordProfile?.id || ''
  const landlordName =
    str(data, 'landlordName') || landlordProfile?.name || user?.name || 'You'
  const vacant =
    user?.role === 'landlord'
      ? landlordUnits.filter((u) => !u.tenantId)
      : vacantApartments(state.apartments, state.tenants).filter((a) =>
          landlordId ? a.landlordId === landlordId : false,
        )
  const selectedId = str(data, 'apartmentId')
  const selectedLandlordUnit =
    user?.role === 'landlord'
      ? landlordUnits.find((a) => a.id === selectedId)
      : undefined
  const selectedAgentUnit =
    user?.role === 'landlord'
      ? undefined
      : state.apartments.find((a) => a.id === selectedId)
  const selected = selectedLandlordUnit ?? selectedAgentUnit
  const building = selectedLandlordUnit
    ? { name: selectedLandlordUnit.buildingName, address: selectedLandlordUnit.buildingAddress }
    : selectedAgentUnit
      ? state.buildings.find((b) => b.id === selectedAgentUnit.buildingId)
      : undefined

  function selectLandlord(id: string) {
    if (landlordLocked) return
    onChange('landlordId', id)
    const landlord = state.landlords.find((l) => l.id === id)
    onChange('landlordName', landlord?.name ?? '')
    onChange('apartmentId', '')
    onChange('propertyAddress', '')
    onChange('unitNumber', '')
    onChange('apartmentAmount', '')
    onChange('apartmentDeposit', '')
    onChange('adminFeeAmount', '')
    onChange('listingRef', '')
  }

  function selectUnit(id: string) {
    if (user?.role === 'landlord') {
      const apartment = landlordUnits.find((a) => a.id === id)
      onChange('apartmentId', id)
      if (apartment) {
        onChange(
          'propertyAddress',
          `${apartment.buildingAddress}, Unit ${apartment.unitNumber}`,
        )
        onChange('unitNumber', apartment.unitNumber)
        onChange('apartmentAmount', String(apartment.rent))
        onChange('apartmentDeposit', String(apartment.deposit))
        onChange('adminFeeAmount', DEFAULT_ADMIN_FEE)
        onChange('listingRef', `${apartment.buildingName}-${apartment.unitNumber}`)
        onChange('amountType', 'monthly-rent')
        if (landlordProfile) {
          onChange('landlordId', landlordProfile.id)
          onChange('landlordName', landlordProfile.name)
        }
        const leaseConfig =
          'leaseConfig' in apartment
            ? (apartment as { leaseConfig?: unknown }).leaseConfig
            : null
        if (leaseConfig) onChange('unitLeaseConfig', leaseConfig)
      }
      return
    }
    const apartment = state.apartments.find((a) => a.id === id)
    const b = apartment
      ? state.buildings.find((x) => x.id === apartment.buildingId)
      : undefined
    onChange('apartmentId', id)
    if (apartment && b) {
      onChange('landlordId', apartment.landlordId)
      const landlord = state.landlords.find((l) => l.id === apartment.landlordId)
      onChange('landlordName', landlord?.name ?? '')
      onChange('propertyAddress', `${b.address}, Unit ${apartment.unitNumber}`)
      onChange('unitNumber', apartment.unitNumber)
      onChange('apartmentAmount', String(apartment.rent))
      onChange('apartmentDeposit', String(apartment.deposit))
      onChange('adminFeeAmount', DEFAULT_ADMIN_FEE)
      onChange('listingRef', `${b.name}-${apartment.unitNumber}`)
      onChange('amountType', 'monthly-rent')
      if (apartment.leaseConfig) onChange('unitLeaseConfig', apartment.leaseConfig)
    } else {
      onChange('propertyAddress', '')
      onChange('unitNumber', '')
      onChange('apartmentAmount', '')
      onChange('apartmentDeposit', '')
      onChange('adminFeeAmount', '')
      onChange('listingRef', '')
    }
  }

  const unitSelectEnabled =
    user?.role === 'landlord' ? portfolioLoaded && Boolean(landlordId) : Boolean(landlordId)

  return (
    <>
      <label className="field field-span">
        <span className="field-label">Landlord</span>
        {landlordLocked ? (
          <input
            className="input-filled-locked"
            type="text"
            value={landlordName}
            readOnly
            aria-readonly="true"
          />
        ) : (
          <select value={landlordId} onChange={(e) => selectLandlord(e.target.value)}>
            <option value="">Choose a landlord…</option>
            {state.landlords.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.email}
              </option>
            ))}
          </select>
        )}
        <span className="field-hint">
          {landlordLocked
            ? 'Pre-filled for this landlord-led application.'
            : 'Select the landlord first. Only their vacant units will appear below.'}
        </span>
      </label>
      <label className="field field-span">
        <span className="field-label">Select unit</span>
        <select
          value={selectedId}
          onChange={(e) => selectUnit(e.target.value)}
          disabled={!unitSelectEnabled}
        >
          <option value="">
            {user?.role === 'landlord'
              ? !portfolioLoaded
                ? 'Loading your units…'
                : 'Choose a vacant unit…'
              : landlordId
                ? 'Choose a vacant unit…'
                : 'Select a landlord first…'}
          </option>
          {vacant.map((a) => {
            if ('buildingName' in a && a.buildingName) {
              return (
                <option key={a.id} value={a.id}>
                  {a.buildingName} · Unit {a.unitNumber} · {formatMoney(a.rent)}/mo
                </option>
              )
            }
            const apt = a as { id: string; unitNumber: string; rent: number; buildingId: string }
            const b = state.buildings.find((x) => x.id === apt.buildingId)
            return (
              <option key={apt.id} value={apt.id}>
                {b?.name ?? 'Building'} · Unit {apt.unitNumber} · {formatMoney(apt.rent)}/mo
              </option>
            )
          })}
        </select>
        <span className="field-hint">
          Only vacant units for the selected landlord appear here.
        </span>
      </label>
      {selected && building ? (
        <>
          <p className="field-hint field-span">
            Selected: {(building as { address?: string }).address ?? ''} · Unit{' '}
            {selected.unitNumber}
          </p>
          <label className="field field-span">
            <span className="field-label">Property address</span>
            <input
              className="input-filled-locked"
              type="text"
              value={String((building as { address?: string }).address ?? '')}
              readOnly
            />
          </label>
          <label className="field">
            <span className="field-label">Unit number</span>
            <input
              className="input-filled-locked"
              type="text"
              value={selected.unitNumber}
              readOnly
            />
          </label>
          <label className="field">
            <span className="field-label">Monthly rent</span>
            <input
              className="input-filled-locked"
              type="text"
              value={formatMoney(selected.rent)}
              readOnly
            />
          </label>
          <label className="field">
            <span className="field-label">Deposit</span>
            <input
              className="input-filled-locked"
              type="text"
              value={formatMoney(selected.deposit)}
              readOnly
            />
          </label>
          <label className="field">
            <span className="field-label">Admin fees</span>
            <input
              className="input-filled-locked"
              type="text"
              value={formatMoney(Number(str(data, 'adminFeeAmount') || DEFAULT_ADMIN_FEE))}
              readOnly
            />
          </label>
        </>
      ) : null}
      {landlordId && vacant.length === 0 ? (
        <p className="section-lead">
          No vacant units for this landlord. Add units under Units (agent) or ask the
          landlord to add units in their portal.
        </p>
      ) : null}
    </>
  )
}

function FileField({
  id,
  label,
  hint,
  files,
  accept,
  onChange,
  uploading,
}: {
  id: string
  label: string
  hint?: string
  files: string[]
  accept?: string
  onChange: (fileList: FileList | null) => void
  uploading?: boolean
}) {
  const buttonText = uploading ? 'Uploading…' : 'Upload'

  return (
    <div className="field file-field field-span">
      {hint ? <span className="field-hint">{hint}</span> : null}
      <label className="file-upload-control">
        <span className={`file-upload-btn${files.length > 0 ? ' has-files' : ''}`}>
          {buttonText}
        </span>
        <input
          id={id}
          className="file-upload-input"
          type="file"
          accept={accept}
          multiple
          disabled={uploading}
          aria-label={`Upload ${label}`}
          onChange={(e) => {
            onChange(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
      {files.length > 0 ? (
        <ul className="file-selected-list">
          {files.map((name) => (
            <li key={`${id}-${name}`} className="file-selected">
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function InspectionItem({
  id,
  label,
  data,
  onChange,
  canEdit,
  onLabelChange,
}: {
  id: string
  label: string
  data: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  canEdit: boolean
  onLabelChange?: (value: string) => void
}) {
  return (
    <div className="inspection-item">
      {onLabelChange ? (
        <input
          type="text"
          className="inspection-item-label-input"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="Feature name"
          disabled={!canEdit}
          aria-label="House feature name"
        />
      ) : (
        <span className="inspection-item-label">{label}</span>
      )}
      <select
        value={str(data, `${id}Condition`)}
        onChange={(e) => onChange(`${id}Condition`, e.target.value)}
        aria-label={`${label} condition`}
        disabled={!canEdit}
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
        disabled={!canEdit}
      />
      <label className="inspection-item-upload" title="Upload photo for this item">
        <input
          type="file"
          accept="image/*"
          disabled={!canEdit}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file || !canEdit) return
            void (async () => {
              try {
                onChange(`${id}PhotoUploading`, true)
                await persistUpload(data, `inspection-${id}`, file)
                onChange(`${id}Photo`, file.name)
              } catch (err) {
                onChange(
                  `${id}PhotoError`,
                  err instanceof Error ? err.message : 'Upload failed',
                )
              } finally {
                onChange(`${id}PhotoUploading`, false)
              }
            })()
          }}
        />
        <span>
          {bool(data, `${id}PhotoUploading`)
            ? '…'
            : str(data, `${id}Photo`)
              ? '✓'
              : '📷'}
        </span>
      </label>
    </div>
  )
}

export function InquiryForm({ data, onChange, viewerRole }: FormProps) {
  const agreementTerm = str(data, 'agreementTerm')
  const moveInDate = str(data, 'moveInDate')
  const fixedTermMonths = termMonthsFromAgreement(agreementTerm)
  const termEndEditable = agreementTerm === 'other'
  const landlordLed = isLandlordInitiated(data) || viewerRole === 'landlord'
  const occupantCount = Number(str(data, 'occupantCount') || '1')

  function setMoveInDate(value: string) {
    onChange('moveInDate', value)
    if (fixedTermMonths && value) {
      onChange('termEndDate', addMonthsToIsoDate(value, fixedTermMonths))
    }
  }

  function setAgreementTerm(value: string) {
    onChange('agreementTerm', value)
    const months = termMonthsFromAgreement(value)
    if (months && moveInDate) {
      onChange('termEndDate', addMonthsToIsoDate(moveInDate, months))
    }
  }

  return (
    <div className="form-grid">
      <div className={`role-callout ${landlordLed ? 'role-shared' : 'role-agent'}`} role="note">
        <strong>
          {landlordLed
            ? 'Editable by landlord.'
            : 'Editable by agent / realtor only.'}
        </strong>
        <span>
          {landlordLed
            ? 'Your landlord profile is pre-filled. Choose a vacant unit and capture the applicant contacts.'
            : 'Agent details are pre-filled and locked. Choose the landlord and unit, then capture the applicant contacts.'}
        </span>
      </div>

      {!landlordLed ? (
        <fieldset className="form-section form-section-locked">
          <legend>1. Agent / realtor details</legend>
          <p className="field-hint field-span">
            Pre-completed for this session — not editable.
          </p>
          <label className="field">
            <span className="field-label">Agent / realtor name</span>
            <input
              className="input-filled-locked"
              type="text"
              value={str(data, 'agentName')}
              readOnly
            />
          </label>
          <label className="field">
            <span className="field-label">Agency / brokerage</span>
            <input
              className="input-filled-locked"
              type="text"
              value={str(data, 'agency')}
              readOnly
            />
          </label>
          <label className="field">
            <span className="field-label">Agent email</span>
            <input
              className="input-filled-locked"
              type="email"
              value={str(data, 'agentEmail')}
              readOnly
            />
          </label>
          <label className="field">
            <span className="field-label">Agent phone</span>
            <input
              className="input-filled-locked"
              type="tel"
              value={str(data, 'agentPhone')}
              readOnly
            />
          </label>
        </fieldset>
      ) : null}

      <fieldset className="form-section">
        <legend>{landlordLed ? '1. Unit & agreement' : '2. Unit & agreement'}</legend>
        <UnitSelectField data={data} onChange={onChange} />
        <label className="field">
          <span className="field-label">Move-in / start date</span>
          <input
            type="date"
            value={moveInDate}
            onChange={(e) => setMoveInDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Agreement term</span>
          <select
            value={agreementTerm}
            onChange={(e) => setAgreementTerm(e.target.value)}
          >
            <option value="">Select…</option>
            <option value="12">12 Months</option>
            <option value="24">24 Months</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Term end date</span>
          <input
            type="date"
            value={str(data, 'termEndDate')}
            onChange={(e) => {
              if (!termEndEditable) return
              onChange('termEndDate', e.target.value)
            }}
            disabled={!termEndEditable}
            className={!termEndEditable ? 'input-filled-locked' : undefined}
            aria-readonly={!termEndEditable}
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
      </fieldset>

      <fieldset className="form-section">
        <legend>{landlordLed ? '2. Applicant contact details' : '3. Applicant contact details'}</legend>
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
            placeholder="+27 82 000 0000"
          />
        </label>
        <label className="field">
          <span className="field-label">Number of applicants / occupants</span>
          <select
            value={str(data, 'occupantCount') === '2' ? '2' : '1'}
            onChange={(e) => onChange('occupantCount', e.target.value)}
          >
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </label>
        {occupantCount >= 2 ? (
          <>
            <p className="field-hint field-span">
              Second applicant details (required when there are 2 applicants).
            </p>
            <label className="field">
              <span className="field-label">Second applicant — full name</span>
              <input
                type="text"
                value={str(data, 'applicant2Name')}
                onChange={(e) => onChange('applicant2Name', e.target.value)}
                placeholder="Full name"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Second applicant — email</span>
              <input
                type="email"
                value={str(data, 'applicant2Email')}
                onChange={(e) => onChange('applicant2Email', e.target.value)}
                placeholder="email@example.com"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Second applicant — phone</span>
              <input
                type="tel"
                value={str(data, 'applicant2Phone')}
                onChange={(e) => onChange('applicant2Phone', e.target.value)}
                placeholder="+27 82 000 0000"
                required
              />
            </label>
          </>
        ) : null}
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
          Complete your income and document uploads. Monthly expenses are optional. The
          agent cannot edit this step.
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
        <legend>Monthly expenses (optional)</legend>
        <p className="section-lead">
          Optional — add typical monthly amounts if available. You can skip this section.
        </p>
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
      </fieldset>

      <fieldset className="form-section">
        <legend>Supporting documents</legend>
        <p className="section-lead">
          Upload one or more files per category. All uploads are optional for navigation.
        </p>
        <FileField
          id="idDocs"
          label="ID documents"
          hint="1. ID documents — passport, driver's license, or national ID"
          files={fileNames(data, 'idDocs')}
          uploading={bool(data, 'idDocsUploading')}
          onChange={makeMultiFileHandler(data, onChange, 'idDocs', 'idDoc')}
        />
        <FileField
          id="payslipDocs"
          label="Payslip"
          hint="2. Payslip — recent payslips"
          files={fileNames(data, 'payslipDocs')}
          uploading={bool(data, 'payslipDocsUploading')}
          onChange={makeMultiFileHandler(data, onChange, 'payslipDocs', 'payslip')}
        />
        <FileField
          id="bankStatementDocs"
          label="Bank statement"
          hint="3. 3 Months bank statement"
          files={fileNames(data, 'bankStatementDocs')}
          uploading={bool(data, 'bankStatementDocsUploading')}
          onChange={makeMultiFileHandler(
            data,
            onChange,
            'bankStatementDocs',
            'bankStatement',
          )}
        />
        {str(data, 'idDocsError') ||
        str(data, 'payslipDocsError') ||
        str(data, 'bankStatementDocsError') ? (
          <p className="field-hint" style={{ color: '#c0392b' }}>
            {str(data, 'idDocsError') ||
              str(data, 'payslipDocsError') ||
              str(data, 'bankStatementDocsError')}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="form-section">
        <legend>Consent & submission</legend>
        <p className="field-hint">Both checkboxes are required to continue.</p>
        <label className="check-field">
          <input
            type="checkbox"
            required
            checked={bool(data, 'creditCheckConsent')}
            onChange={(e) => onChange('creditCheckConsent', e.target.checked)}
          />
          <span>
            I consent to the system administrator running an identity (KYC) and credit
            check as part of this application{' '}
            <span className="required-marker" aria-hidden="true">
              *
            </span>
          </span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            required
            checked={bool(data, 'docsSubmitted')}
            onChange={(e) => onChange('docsSubmitted', e.target.checked)}
          />
          <span>
            I confirm my details and documents are ready for first review{' '}
            <span className="required-marker" aria-hidden="true">
              *
            </span>
          </span>
        </label>
      </fieldset>
    </div>
  )
}

function num(data: Record<string, unknown>, key: string) {
  const n = Number(str(data, key))
  return Number.isFinite(n) ? n : 0
}

function totalIncome(data: Record<string, unknown>) {
  return num(data, 'grossSalary') + num(data, 'otherIncome')
}

function totalExpenses(data: Record<string, unknown>) {
  return (
    num(data, 'expenseRentBond') +
    num(data, 'expenseCar') +
    num(data, 'expensePhone') +
    num(data, 'expenseCredit') +
    num(data, 'expenseOtherLoans') +
    num(data, 'expenseOther')
  )
}

export function KycForm({ data, onChange, viewerRole }: FormProps) {
  const applicant = str(data, 'applicantName') || 'the applicant'
  const landlordLed = isLandlordInitiated(data)
  const income = totalIncome(data)
  const expenses = totalExpenses(data)
  const rent = num(data, 'apartmentAmount')
  const expenseRatio = income > 0 ? expenses / income : 0
  const rentRatio = income > 0 ? rent / income : 0
  const expenseHighRisk = income > 0 && expenseRatio > 0.8
  const rentHighRisk = income > 0 && rentRatio > 0.3
  const canDecide =
    !viewerRole ||
    viewerRole === 'landlord' ||
    viewerRole === 'tenant' ||
    (!landlordLed && (viewerRole === 'admin' || viewerRole === 'agent'))

  return (
    <div className="form-grid">
      <div className="kyc-report-banner">
        <p className="kyc-report-title">KYC report for {applicant}</p>
        <p className="kyc-report-sub">
          {landlordLed
            ? 'Review income risk, then approve or reject before continuing with identity and credit checks.'
            : 'Identity and credit results for this application. Agent approval is required to continue.'}
        </p>
      </div>

      <fieldset className="form-section">
        <legend>Income &amp; expenses outcome</legend>
        <p className="section-lead field-span">
          Summary from the applicant&apos;s salary and expenses (stage 2).
        </p>
        <div className="field field-span risk-summary-grid">
          <div className="risk-card">
            <strong>Expenses vs income</strong>
            <p>
              Monthly expenses {formatMoney(expenses)} · Total income{' '}
              {formatMoney(income)}
              {income > 0 ? ` (${Math.round(expenseRatio * 100)}%)` : ''}
            </p>
            <p className={expenseHighRisk ? 'risk-high' : 'risk-low'}>
              {income <= 0
                ? 'Income not provided yet — risk cannot be assessed.'
                : expenseHighRisk
                  ? 'High risk — expenses are above 80% of total income.'
                  : 'Low risk — expenses are within 80% of total income.'}
            </p>
          </div>
          <div className="risk-card">
            <strong>Rent vs income</strong>
            <p>
              Monthly rent {formatMoney(rent)} · Total income {formatMoney(income)}
              {income > 0 ? ` (${Math.round(rentRatio * 100)}%)` : ''}
            </p>
            <p className={rentHighRisk ? 'risk-high' : 'risk-low'}>
              {income <= 0
                ? 'Income not provided yet — risk cannot be assessed.'
                : rentHighRisk
                  ? 'High risk — rent is over 30% of total income.'
                  : 'Low risk — rent is within 30% of total income.'}
            </p>
          </div>
        </div>
        {canDecide ? (
          <div className="field field-span kyc-decision-row">
            <button
              type="button"
              className={`btn btn-compact${bool(data, 'kycAffordabilityApproved') ? ' btn-primary' : ' btn-ghost'}`}
              onClick={() => {
                onChange('kycAffordabilityApproved', true)
                onChange('kycAffordabilityRejected', false)
              }}
            >
              Approve application
            </button>
            <button
              type="button"
              className={`btn btn-compact${bool(data, 'kycAffordabilityRejected') ? ' btn-primary' : ' btn-ghost'}`}
              onClick={() => {
                onChange('kycAffordabilityRejected', true)
                onChange('kycAffordabilityApproved', false)
              }}
            >
              Reject application
            </button>
            {bool(data, 'kycAffordabilityApproved') ? (
              <span className="field-hint risk-low">Approved — continue with KYC &amp; credit check.</span>
            ) : null}
            {bool(data, 'kycAffordabilityRejected') ? (
              <span className="field-hint risk-high">Rejected — this application should not proceed.</span>
            ) : null}
          </div>
        ) : null}
      </fieldset>

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
        <div className="field field-span">
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            onClick={() => {
              window.alert('Full KYC and credit report download will be available soon.')
            }}
          >
            Download full KYC &amp; credit check report
          </button>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>Approvals</legend>
        {landlordLed ? (
          <>
            <p className="field-hint field-span">
              Landlord or tenant must approve affordability above before continuing.
            </p>
            <label className="check-field">
              <input
                type="checkbox"
                checked={bool(data, 'landlordKycApproved')}
                onChange={(e) => onChange('landlordKycApproved', e.target.checked)}
                disabled={viewerRole === 'tenant'}
              />
              <span>Landlord approves this KYC report and recommends proceeding</span>
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={bool(data, 'tenantKycApproved')}
                onChange={(e) => onChange('tenantKycApproved', e.target.checked)}
                disabled={viewerRole === 'landlord'}
              />
              <span>Tenant acknowledges the KYC / credit outcome</span>
            </label>
          </>
        ) : (
          <>
            <p className="field-hint">Agent approval is required to continue.</p>
            <label className="check-field">
              <input
                type="checkbox"
                required
                checked={bool(data, 'agentKycApproved')}
                onChange={(e) => onChange('agentKycApproved', e.target.checked)}
              />
              <span>
                Agent approves this KYC report and recommends proceeding{' '}
                <span className="required-marker" aria-hidden="true">
                  *
                </span>
              </span>
            </label>
          </>
        )}
      </fieldset>
    </div>
  )
}

function BankingDetailsCard({ data }: FormProps) {
  return (
    <div className="banking-card">
      <h3>Banking details for this rental unit</h3>
      <p className="banking-hint">Pre-filled for this unit — use as shown when paying.</p>
      <dl className="banking-details">
        <div>
          <dt>Account name</dt>
          <dd>
            <input
              className="input-filled-locked"
              type="text"
              value={str(data, 'bankAccountName') || 'Property Trust Account'}
              readOnly
            />
          </dd>
        </div>
        <div>
          <dt>Bank</dt>
          <dd>
            <input
              className="input-filled-locked"
              type="text"
              value={str(data, 'bankName') || 'First National Bank'}
              readOnly
            />
          </dd>
        </div>
        <div>
          <dt>Account number</dt>
          <dd>
            <input
              className="input-filled-locked"
              type="text"
              value={str(data, 'bankAccountNumber') || '6284017392'}
              readOnly
            />
          </dd>
        </div>
        <div>
          <dt>Branch code</dt>
          <dd>
            <input
              className="input-filled-locked"
              type="text"
              value={str(data, 'bankBranchCode') || '250655'}
              readOnly
            />
          </dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd>
            <input
              className="input-filled-locked"
              type="text"
              value={
                str(data, 'bankReference') ||
                str(data, 'listingRef') ||
                str(data, 'unitNumber') ||
                'UNIT-REF'
              }
              readOnly
            />
          </dd>
        </div>
      </dl>
      <p className="banking-hint">
        Use the reference above so the payment can be matched to this apartment.
      </p>
    </div>
  )
}

function paymentAmountFromStep1(data: Record<string, unknown>) {
  const deposit = str(data, 'apartmentDeposit')
  const rent = str(data, 'apartmentAmount')
  const admin = str(data, 'adminFeeAmount') || DEFAULT_ADMIN_FEE
  const total =
    (Number(deposit) || 0) + (Number(rent) || 0) + (Number(admin) || 0)
  return {
    deposit,
    rent,
    admin,
    total: total > 0 ? String(total) : '',
  }
}

export function KycFeesForm({ data, onChange }: FormProps) {
  const kycFee = str(data, 'adminFeeAmount') || DEFAULT_ADMIN_FEE
  const storedAdmin = str(data, 'adminFeeAmount')
  const storedKycFee = str(data, 'kycFeeAmount')

  useEffect(() => {
    if (!storedAdmin) {
      onChange('adminFeeAmount', DEFAULT_ADMIN_FEE)
    }
  }, [storedAdmin, onChange])

  useEffect(() => {
    if (storedKycFee !== kycFee) {
      onChange('kycFeeAmount', kycFee)
    }
  }, [kycFee, storedKycFee, onChange])

  return (
    <div className="form-grid">
      <div className="role-callout role-applicant" role="note">
        <strong>KYC check admin fee required from the tenant.</strong>
        <span>
          Pay the admin fee for the KYC / credit check using the banking details
          below, then upload proof of payment.
        </span>
      </div>

      <BankingDetailsCard data={data} onChange={onChange} />

      <fieldset className="form-section">
        <legend>Amount to pay</legend>
        <label className="field">
          <span className="field-label">KYC check admin fees</span>
          <input
            className="input-filled-locked"
            type="number"
            min={0}
            value={kycFee}
            readOnly
          />
          <span className="field-hint">Auto-filled — no input required.</span>
        </label>
        <label className="field">
          <span className="field-label">Payment method</span>
          <select
            value={str(data, 'kycFeePaymentMethod')}
            onChange={(e) => onChange('kycFeePaymentMethod', e.target.value)}
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
          id="kycFeeProofOfPayment"
          label="Upload proof of payment"
          hint="Bank receipt, screenshot, or PDF confirmation"
          accept=".pdf,image/*"
          files={fileNames(data, 'kycFeeProofOfPayment')}
          uploading={bool(data, 'kycFeeProofOfPaymentUploading')}
          onChange={makeMultiFileHandler(
            data,
            onChange,
            'kycFeeProofOfPayment',
            'kycFeeProofOfPayment',
          )}
        />
        <label className="check-field">
          <input
            type="checkbox"
            checked={bool(data, 'kycFeePaymentConfirmed')}
            onChange={(e) => onChange('kycFeePaymentConfirmed', e.target.checked)}
          />
          <span>I confirm the KYC check admin fees have been paid</span>
        </label>
      </fieldset>
    </div>
  )
}

export function PaymentForm({ data, onChange }: FormProps) {
  const amounts = paymentAmountFromStep1(data)
  const storedDeposit = str(data, 'paymentDeposit')
  const storedRent = str(data, 'paymentRent')
  const storedAdmin = str(data, 'paymentAdminFees')
  const storedTotal = str(data, 'paymentTotal')

  useEffect(() => {
    if (amounts.deposit && storedDeposit !== amounts.deposit) {
      onChange('paymentDeposit', amounts.deposit)
    }
    if (amounts.rent && storedRent !== amounts.rent) {
      onChange('paymentRent', amounts.rent)
    }
    if (amounts.admin && storedAdmin !== amounts.admin) {
      onChange('paymentAdminFees', amounts.admin)
    }
    if (amounts.total && storedTotal !== amounts.total) {
      onChange('paymentTotal', amounts.total)
    }
  }, [
    amounts.deposit,
    amounts.rent,
    amounts.admin,
    amounts.total,
    storedDeposit,
    storedRent,
    storedAdmin,
    storedTotal,
    onChange,
  ])

  return (
    <div className="form-grid">
      <div className="role-callout role-applicant" role="note">
        <strong>Payment required from the tenant.</strong>
        <span>
          Pay the deposit, rent, and admin fees using the banking details below, then
          upload proof of payment.
        </span>
      </div>

      <BankingDetailsCard data={data} onChange={onChange} />

      <fieldset className="form-section">
        <legend>Amounts to pay</legend>
        <label className="field">
          <span className="field-label">Deposit</span>
          <input
            className="input-filled-locked"
            type="number"
            min={0}
            value={amounts.deposit}
            readOnly
          />
          <span className="field-hint">Auto-filled from the unit — no input required.</span>
        </label>
        <label className="field">
          <span className="field-label">Rent</span>
          <input
            className="input-filled-locked"
            type="number"
            min={0}
            value={amounts.rent}
            readOnly
          />
          <span className="field-hint">Auto-filled from the unit — no input required.</span>
        </label>
        <label className="field">
          <span className="field-label">Admin fees</span>
          <input
            className="input-filled-locked"
            type="number"
            min={0}
            value={amounts.admin}
            readOnly
          />
          <span className="field-hint">Auto-filled — no input required.</span>
        </label>
        <label className="field">
          <span className="field-label">Total to pay</span>
          <input
            className="input-filled-locked"
            type="number"
            min={0}
            value={amounts.total}
            readOnly
          />
          <span className="field-hint">Calculated total — no input required.</span>
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
          files={fileNames(data, 'proofOfPayment')}
          uploading={bool(data, 'proofOfPaymentUploading')}
          onChange={makeMultiFileHandler(data, onChange, 'proofOfPayment', 'proofOfPayment')}
        />
        <label className="check-field">
          <input
            type="checkbox"
            checked={bool(data, 'paymentConfirmed')}
            onChange={(e) => onChange('paymentConfirmed', e.target.checked)}
          />
          <span>I confirm deposit, rent, and admin fees have been paid</span>
        </label>
      </fieldset>
    </div>
  )
}

function PartySignStatusBoard({
  statuses,
}: {
  statuses: ReturnType<typeof leaseSignatureStatuses>
}) {
  const allDone = statuses.every((s) => s.done)
  return (
    <div
      className={`party-sign-status${allDone ? ' party-sign-status-complete' : ''}`}
      role="status"
    >
      <strong>
        {allDone
          ? 'Required parties have signed'
          : 'Signature status — syncs live when each party confirms'}
      </strong>
      <ul className="party-sign-list">
        {statuses.map((s) => (
          <li key={s.role} className={s.done ? 'signed' : 'pending'}>
            <span className="party-sign-mark" aria-hidden="true">
              {s.done ? '✓' : '○'}
            </span>
            <span>
              {s.label}: {s.done ? 'Signed' : 'Waiting to sign'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LeaseSignatureBlock({
  legend,
  markKey,
  doneKey,
  dateKey,
  nameKey,
  enabled,
  data,
  onChange,
}: {
  legend: string
  markKey: string
  doneKey: string
  dateKey: string
  nameKey: string
  enabled: boolean
  data: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}) {
  const mark = str(data, markKey)
  const done = bool(data, doneKey)
  return (
    <fieldset className="signature-block" disabled={!enabled && !mark}>
      <legend>{legend}</legend>
      {done && mark ? (
        <SignaturePad
          label="Saved signature"
          existingMark={mark}
          disabled={!enabled}
          onAccept={() => undefined}
          onClearSaved={
            enabled
              ? () => {
                  onChange(markKey, '')
                  onChange(doneKey, false)
                  onChange(dateKey, '')
                }
              : undefined
          }
        />
      ) : (
        <SignaturePad
          label="Draw your signature (mouse or finger)"
          disabled={!enabled}
          onAccept={(dataUrl) => {
            onChange(markKey, dataUrl)
            onChange(doneKey, true)
            onChange(dateKey, new Date().toISOString().slice(0, 10))
            if (!str(data, nameKey)) {
              onChange(
                nameKey,
                legend.toLowerCase().includes('landlord')
                  ? str(data, 'landlordName') || 'Landlord'
                  : legend.toLowerCase().includes('agent')
                    ? str(data, 'agentName') || 'Agent'
                    : str(data, 'applicantName') || 'Tenant',
              )
            }
          }}
        />
      )}
      {enabled && !done ? (
        <span className="field-hint field-span">
          Draw your signature, then click “Use this signature”. Click Next after signing to
          continue.
        </span>
      ) : null}
      {done ? (
        <span className="field-hint field-span">
          Signed{str(data, dateKey) ? ` on ${str(data, dateKey)}` : ''}.
        </span>
      ) : null}
    </fieldset>
  )
}

function ensureLeaseDocument(
  data: Record<string, unknown>,
  onChange: (key: string, value: unknown) => void,
  config: UnitLeaseConfig | null,
) {
  if (str(data, 'leaseDocumentHtml') || str(data, 'leasePdfDataUrl')) return
  if (!config) {
    // Fall back to generic template with no special clauses
    const html = composeLeaseHtml(
      {
        mode: 'template',
        selectedClauseIds: [],
        clauseParams: {},
        customClauses: [],
      },
      factsFromApplicationData(data),
    )
    onChange('leaseDocumentHtml', html)
    onChange('leaseDocumentGeneratedAt', new Date().toISOString())
    onChange('leaseDocumentMode', 'template')
    return
  }
  if (config.mode === 'upload' && config.leasePdfDataUrl) {
    onChange('leasePdfDataUrl', config.leasePdfDataUrl)
    onChange('leasePdf', config.leasePdfName ? [config.leasePdfName] : ['Uploaded lease.pdf'])
    onChange('leaseDocumentMode', 'upload')
    onChange('leaseDocumentGeneratedAt', new Date().toISOString())
    return
  }
  const html = composeLeaseHtml(config, factsFromApplicationData(data))
  onChange('leaseDocumentHtml', html)
  onChange('leaseDocumentGeneratedAt', new Date().toISOString())
  onChange('leaseDocumentMode', 'template')
}

export function LeaseForm({ data, onChange, viewerRole }: FormProps) {
  const isAgent = viewerRole === 'admin' || viewerRole === 'agent' || !viewerRole
  const canTenant = !viewerRole || viewerRole === 'tenant'
  const canLandlord = !viewerRole || viewerRole === 'landlord'
  const canAgent = isAgent
  const statuses = leaseSignatureStatuses(data)
  const [loadingDoc, setLoadingDoc] = useState(false)

  useEffect(() => {
    if (str(data, 'leaseDocumentHtml') || str(data, 'leasePdfDataUrl')) return

    const fromForm = parseLeaseConfig(data.unitLeaseConfig)
    if (fromForm) {
      ensureLeaseDocument(data, onChange, fromForm)
      return
    }

    const apartmentId = str(data, 'apartmentId')
    if (!apartmentId) {
      ensureLeaseDocument(data, onChange, null)
      return
    }

    let cancelled = false
    setLoadingDoc(true)
    void fetchApartment(apartmentId)
      .then((result) => {
        if (cancelled) return
        const raw = result.data.leaseConfig ?? result.data.lease_config ?? null
        const config = parseLeaseConfig(raw)
        if (config) onChange('unitLeaseConfig', config)
        ensureLeaseDocument(
          { ...data, unitLeaseConfig: config ?? data.unitLeaseConfig },
          onChange,
          config,
        )
      })
      .catch(() => {
        if (!cancelled) ensureLeaseDocument(data, onChange, null)
      })
      .finally(() => {
        if (!cancelled) setLoadingDoc(false)
      })

    return () => {
      cancelled = true
    }
    // Intentionally once when lease stage mounts / when ids change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [str(data, 'apartmentId'), str(data, 'leaseDocumentHtml'), str(data, 'leasePdfDataUrl')])

  const htmlDoc = str(data, 'leaseDocumentHtml')
  const pdfUrl = str(data, 'leasePdfDataUrl')
  const mode = str(data, 'leaseDocumentMode') || (pdfUrl ? 'upload' : 'template')

  // Keep template lease preview in sync with freehand signatures once captured.
  useEffect(() => {
    if (mode === 'upload' || pdfUrl) return
    if (!htmlDoc) return
    const tenantMark = str(data, 'signApplicantMark')
    const landlordMark = str(data, 'signLandlordMark')
    if (!tenantMark && !landlordMark) return
    const config =
      parseLeaseConfig(data.unitLeaseConfig) ??
      ({
        mode: 'template' as const,
        selectedClauseIds: [],
        clauseParams: {},
        customClauses: [],
      } satisfies UnitLeaseConfig)
    const nextHtml = composeLeaseHtml(config, factsFromApplicationData(data))
    if (nextHtml !== htmlDoc) onChange('leaseDocumentHtml', nextHtml)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    pdfUrl,
    str(data, 'signApplicantMark'),
    str(data, 'signLandlordMark'),
    str(data, 'signApplicantDate'),
    str(data, 'signLandlordDate'),
    str(data, 'signApplicantName'),
    str(data, 'signLandlordName'),
  ])

  return (
    <div className="form-grid">
      <div className="role-callout role-shared" role="note">
        <strong>Lease signing — tenant and landlord.</strong>
        <span>
          Review the lease document, draw your freehand signature, then click Next. Move-in
          unlocks only after both the tenant and the landlord have clicked Next. The agent
          is not required to sign.
        </span>
      </div>

      <PartySignStatusBoard statuses={statuses} />

      {canAgent ? (
        <fieldset className="form-section">
          <legend>Lease dates</legend>
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
          <p className="field-hint field-span">
            The lease document is generated from the unit’s template or uploaded PDF. Agent
            override upload is optional if the unit has no lease config yet.
          </p>
          <FileField
            id="leasePdf"
            label="Optional override PDF"
            hint="Only needed if the unit has no lease configuration"
            accept=".pdf,application/pdf"
            files={fileNames(data, 'leasePdf')}
            uploading={bool(data, 'leasePdfUploading')}
            onChange={makeMultiFileHandler(data, onChange, 'leasePdf', 'leasePdf')}
          />
        </fieldset>
      ) : null}

      <div className="pdf-signer">
        <div className="pdf-preview lease-doc-frame" aria-label="Lease agreement document">
          <div className="pdf-preview-header">
            <span>Lease agreement</span>
            <span className="pdf-file-name">
              {mode === 'upload'
                ? fileNames(data, 'leasePdf').join(', ') || 'Uploaded PDF'
                : 'Platform template'}
              {str(data, 'leaseDocumentGeneratedAt')
                ? ` · ${str(data, 'leaseDocumentGeneratedAt').slice(0, 10)}`
                : ''}
            </span>
          </div>
          <div className="lease-doc-scroller">
            {loadingDoc ? (
              <p className="pdf-preview-note">Preparing lease document…</p>
            ) : pdfUrl ? (
              <iframe title="Lease PDF" src={pdfUrl} className="lease-doc-iframe" />
            ) : htmlDoc ? (
              <iframe
                title="Lease agreement"
                className="lease-doc-iframe"
                srcDoc={htmlDoc}
                sandbox=""
              />
            ) : (
              <p className="pdf-preview-note">Lease document is not available yet.</p>
            )}
          </div>
        </div>

        <div className="signature-grid signature-grid-2">
          <LeaseSignatureBlock
            legend="Applicant signature"
            markKey="signApplicantMark"
            doneKey="signApplicantDone"
            dateKey="signApplicantDate"
            nameKey="signApplicantName"
            enabled={canTenant}
            data={data}
            onChange={onChange}
          />
          <LeaseSignatureBlock
            legend="Landlord signature"
            markKey="signLandlordMark"
            doneKey="signLandlordDone"
            dateKey="signLandlordDate"
            nameKey="signLandlordName"
            enabled={canLandlord}
            data={data}
            onChange={onChange}
          />
        </div>
      </div>
    </div>
  )
}

export function SuccessForm({ data }: FormProps) {
  const applicant = str(data, 'applicantName') || 'the applicant'
  const property = str(data, 'propertyAddress') || 'the selected unit'
  const applicationId = str(data, 'applicationId')
  const tenantId = str(data, 'tenantId')
  const [leaseBusy, setLeaseBusy] = useState(false)
  const [leaseError, setLeaseError] = useState<string | null>(null)

  async function onDownloadLease() {
    setLeaseBusy(true)
    setLeaseError(null)
    try {
      const { downloadApplicationLease, downloadTenantLease } = await import('../../data/api')
      if (tenantId) {
        await downloadTenantLease(tenantId)
      } else if (applicationId) {
        await downloadApplicationLease(applicationId)
      } else {
        throw new Error('Lease is not ready to download yet')
      }
    } catch (err) {
      setLeaseError(err instanceof Error ? err.message : 'Could not download lease')
    } finally {
      setLeaseBusy(false)
    }
  }

  return (
    <div className="success-panel" role="status">
      <div className="success-panel-mark" aria-hidden="true">
        ✓
      </div>
      <h3>Application successfully completed</h3>
      <p className="success-panel-lead">
        Everything required for this tenancy has been finished. You are all set —
        nothing further is needed on this application.
      </p>
      <dl className="success-panel-meta">
        <div>
          <dt>Applicant</dt>
          <dd>{applicant}</dd>
        </div>
        <div>
          <dt>Property</dt>
          <dd>{property}</dd>
        </div>
      </dl>
      <ul className="success-panel-checks">
        <li>Lease signed by tenant and landlord</li>
        <li>Move-in inspection recorded</li>
        <li>Application closed successfully</li>
      </ul>
      {applicationId || tenantId ? (
        <div className="success-panel-actions">
          <button
            type="button"
            className="btn btn-primary btn-compact"
            disabled={leaseBusy}
            onClick={() => void onDownloadLease()}
          >
            {leaseBusy ? 'Preparing lease…' : 'Download lease agreement'}
          </button>
          {leaseError ? <p className="login-error">{leaseError}</p> : null}
        </div>
      ) : null}
      <p className="success-panel-note">
        Use <strong>Go to Dashboard</strong> below to return to your portal home. You can also
        download the lease later from the tenant profile.
      </p>
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

export function MoveInForm({ data, onChange, viewerRole }: FormProps) {
  const landlordLed = isLandlordInitiated(data)
  const canFillChecklist =
    !viewerRole ||
    (landlordLed
      ? viewerRole === 'landlord' || viewerRole === 'admin'
      : viewerRole === 'admin' || viewerRole === 'agent')
  const canTenant = !viewerRole || viewerRole === 'tenant'
  const canLandlordAck = !viewerRole || viewerRole === 'landlord'
  const canAgentAck =
    !landlordLed && (!viewerRole || viewerRole === 'admin' || viewerRole === 'agent')
  const statuses = moveInSignStatuses(data)
  const customItems = Array.isArray(data.customInspectionItems)
    ? (data.customInspectionItems as Array<{ id: string; label: string }>)
    : []

  function setCustomItems(next: Array<{ id: string; label: string }>) {
    onChange('customInspectionItems', next)
  }

  return (
    <div className="form-grid">
      <div className="role-callout role-shared" role="note">
        <strong>
          {landlordLed
            ? 'Move-in inspection — landlord and tenant.'
            : 'Move-in inspection — agent and tenant.'}
        </strong>
        <span>
          {landlordLed
            ? 'The landlord completes the inspection form. The tenant and landlord both acknowledge the recorded condition. The landlord clicks Next to open the success page.'
            : 'The agent completes the inspection form. The tenant only acknowledges the recorded condition. Only the agent clicks Next, which opens the success page for everyone.'}
        </span>
      </div>

      <PartySignStatusBoard statuses={statuses} />

      <fieldset className="form-section" disabled={!canFillChecklist}>
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
          <span className="field-label">
            {landlordLed ? 'Inspecting landlord' : 'Inspecting agent'}
          </span>
          <input
            type="text"
            value={
              landlordLed
                ? str(data, 'inspectionLandlord') || str(data, 'landlordName')
                : str(data, 'inspectionAgent') || str(data, 'agentName')
            }
            onChange={(e) =>
              onChange(
                landlordLed ? 'inspectionLandlord' : 'inspectionAgent',
                e.target.value,
              )
            }
            placeholder={landlordLed ? 'Landlord name' : 'Agent name'}
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
      </fieldset>

      <fieldset className="form-section inspection-section" disabled={!canFillChecklist}>
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
              canEdit={canFillChecklist}
            />
          ))}
          {customItems.map((item, index) => (
            <InspectionItem
              key={item.id}
              id={item.id}
              label={item.label}
              data={data}
              onChange={onChange}
              canEdit={canFillChecklist}
              onLabelChange={(value) => {
                const next = customItems.map((row, i) =>
                  i === index ? { ...row, label: value } : row,
                )
                setCustomItems(next)
              }}
            />
          ))}
        </div>
        {canFillChecklist ? (
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            onClick={() => {
              setCustomItems([
                ...customItems,
                { id: `inspCustom${Date.now()}`, label: '' },
              ])
            }}
          >
            Add other
          </button>
        ) : null}
      </fieldset>

      <fieldset className="form-section">
        <legend>Sign-off</legend>
        <div className="signature-grid signature-grid-movein">
          {canAgentAck || bool(data, 'inspectionAgentSigned') ? (
            <LeaseSignatureBlock
              legend="Agent acknowledgement"
              markKey="inspectionAgentMark"
              doneKey="inspectionAgentSigned"
              dateKey="inspectionAgentDate"
              nameKey="inspectionAgentName"
              enabled={canAgentAck}
              data={data}
              onChange={onChange}
            />
          ) : null}
          <LeaseSignatureBlock
            legend="Landlord acknowledgement"
            markKey="inspectionLandlordMark"
            doneKey="inspectionLandlordSigned"
            dateKey="inspectionLandlordDate"
            nameKey="inspectionLandlordName"
            enabled={canLandlordAck}
            data={data}
            onChange={onChange}
          />
          <LeaseSignatureBlock
            legend="Tenant acknowledgement"
            markKey="inspectionTenantMark"
            doneKey="inspectionTenantSigned"
            dateKey="inspectionTenantDate"
            nameKey="inspectionTenantName"
            enabled={canTenant}
            data={data}
            onChange={onChange}
          />
        </div>
        {canTenant && !canFillChecklist ? (
          <span className="field-hint">
            Draw your signature to acknowledge.{' '}
            {landlordLed
              ? 'Only the landlord can click Next to finish this application.'
              : 'Only the agent can click Next to finish this application.'}
          </span>
        ) : null}
      </fieldset>
    </div>
  )
}

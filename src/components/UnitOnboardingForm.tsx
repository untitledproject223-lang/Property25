import { useState, type FormEvent } from 'react'
import {
  CLAUSE_CATALOG,
  type ClauseId,
  type CustomLeaseClause,
  type LeaseMode,
  type UnitLeaseConfig,
} from '../lease'
import './UnitOnboardingForm.css'

const PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
]

export type UnitOnboardingPayload = {
  streetAddress: string
  province: string
  suburb: string
  postalCode: string
  unitNumber: string
  rent: number
  deposit: number
  landlordId?: string
  buildingName: string
  buildingAddress: string
  levies?: number | null
  municipal?: number | null
  purchasePrice?: number | null
  bankOwed?: number | null
  leaseConfig: UnitLeaseConfig
}

type LandlordOption = { id: string; name: string }

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export default function UnitOnboardingForm({
  landlords,
  lockedLandlordId,
  submitting,
  error,
  onCancel,
  onSubmit,
}: {
  landlords?: LandlordOption[]
  lockedLandlordId?: string
  submitting?: boolean
  error?: string | null
  onCancel: () => void
  onSubmit: (payload: UnitOnboardingPayload) => Promise<void> | void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [streetAddress, setStreetAddress] = useState('')
  const [province, setProvince] = useState('')
  const [suburb, setSuburb] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [unitNumber, setUnitNumber] = useState('')
  const [rent, setRent] = useState('')
  const [deposit, setDeposit] = useState('')
  const [landlordId, setLandlordId] = useState(
    lockedLandlordId || landlords?.[0]?.id || '',
  )
  const [levies, setLevies] = useState('')
  const [municipal, setMunicipal] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [bankOwed, setBankOwed] = useState('')
  const [leaseMode, setLeaseMode] = useState<LeaseMode>('template')
  const [selectedClauses, setSelectedClauses] = useState<ClauseId[]>([])
  const [noticeMonths, setNoticeMonths] = useState('1')
  const [petsAllowed, setPetsAllowed] = useState(false)
  const [petsNote, setPetsNote] = useState('')
  const [parkingBay, setParkingBay] = useState('')
  const [maxOccupants, setMaxOccupants] = useState('')
  const [earlyTerminationMonths, setEarlyTerminationMonths] = useState('1')
  const [earlyTerminationFee, setEarlyTerminationFee] = useState('')
  const [customClauses, setCustomClauses] = useState<CustomLeaseClause[]>([])
  const [leasePdfName, setLeasePdfName] = useState<string | null>(null)
  const [leasePdfDataUrl, setLeasePdfDataUrl] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const showLandlord = !lockedLandlordId && (landlords?.length ?? 0) > 0

  function toggleClause(id: ClauseId) {
    setSelectedClauses((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function validateStep1(): string | null {
    if (!streetAddress.trim()) return 'Street address is required.'
    if (!province.trim()) return 'Province is required.'
    if (!suburb.trim()) return 'Suburb / town is required.'
    if (!postalCode.trim()) return 'ZIP / postal code is required.'
    if (!unitNumber.trim()) return 'Unit number is required.'
    const rentValue = Number(rent)
    const depositValue = Number(deposit)
    if (!rentValue || rentValue < 0) return 'Enter a valid monthly rent.'
    if (!Number.isFinite(depositValue) || depositValue < 0) {
      return 'Deposit is required.'
    }
    if (showLandlord && !landlordId) return 'Select a landlord.'
    return null
  }

  function validateStep3(): string | null {
    if (leaseMode === 'upload') {
      if (!leasePdfDataUrl || !leasePdfName) {
        return 'Upload your lease agreement PDF, or switch to the platform template.'
      }
      return null
    }
    if (selectedClauses.includes('noticePeriod')) {
      const months = Number(noticeMonths)
      if (!Number.isFinite(months) || months < 1) {
        return 'Enter a valid notice period in months.'
      }
    }
    if (selectedClauses.includes('pets') && petsAllowed && !petsNote.trim()) {
      // note optional — allow
    }
    for (const c of customClauses) {
      if (!c.title.trim() || !c.body.trim()) {
        return 'Custom clauses need both a title and body text.'
      }
    }
    return null
  }

  function buildLeaseConfig(): UnitLeaseConfig {
    if (leaseMode === 'upload') {
      return {
        mode: 'upload',
        selectedClauseIds: [],
        clauseParams: {},
        customClauses: [],
        leasePdfName,
        leasePdfDataUrl,
      }
    }
    return {
      mode: 'template',
      selectedClauseIds: selectedClauses,
      clauseParams: {
        noticeMonths: Number(noticeMonths) || 1,
        petsAllowed,
        petsNote: petsNote.trim() || undefined,
        parkingBay: parkingBay.trim() || undefined,
        maxOccupants: maxOccupants.trim() ? Number(maxOccupants) : undefined,
        earlyTerminationMonths: Number(earlyTerminationMonths) || 1,
        earlyTerminationFee: earlyTerminationFee.trim() || undefined,
      },
      customClauses: customClauses.filter((c) => c.title.trim() && c.body.trim()),
      leasePdfName: null,
      leasePdfDataUrl: null,
    }
  }

  function goNextFrom1(e: FormEvent) {
    e.preventDefault()
    const err = validateStep1()
    if (err) {
      setLocalError(err)
      return
    }
    setLocalError(null)
    setStep(2)
  }

  function goNextFrom2(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    setStep(3)
  }

  async function finish(e: FormEvent) {
    e.preventDefault()
    const err1 = validateStep1()
    if (err1) {
      setLocalError(err1)
      setStep(1)
      return
    }
    const err3 = validateStep3()
    if (err3) {
      setLocalError(err3)
      return
    }
    setLocalError(null)
    const optionalNumber = (value: string) => {
      if (!value.trim()) return null
      const n = Number(value)
      return Number.isFinite(n) && n >= 0 ? n : null
    }
    const buildingName = `${streetAddress.trim()}, ${suburb.trim()}`
    const buildingAddress = [
      streetAddress.trim(),
      suburb.trim(),
      province.trim(),
      postalCode.trim(),
    ].join(', ')

    await onSubmit({
      streetAddress: streetAddress.trim(),
      province: province.trim(),
      suburb: suburb.trim(),
      postalCode: postalCode.trim(),
      unitNumber: unitNumber.trim(),
      rent: Number(rent),
      deposit: Number(deposit),
      landlordId: lockedLandlordId || landlordId || undefined,
      buildingName,
      buildingAddress,
      levies: optionalNumber(levies),
      municipal: optionalNumber(municipal),
      purchasePrice: optionalNumber(purchasePrice),
      bankOwed: optionalNumber(bankOwed),
      leaseConfig: buildLeaseConfig(),
    })
  }

  async function onLeasePdfSelected(file: File | null) {
    if (!file) {
      setLeasePdfName(null)
      setLeasePdfDataUrl(null)
      return
    }
    if (file.type && file.type !== 'application/pdf') {
      setLocalError('Please upload a PDF file.')
      return
    }
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setLeasePdfName(file.name)
      setLeasePdfDataUrl(dataUrl)
      setLocalError(null)
    } catch {
      setLocalError('Could not read the PDF file.')
    }
  }

  return (
    <div className="unit-onboard">
      <div className="unit-onboard-steps" aria-label="Form steps">
        <span className={step === 1 ? 'is-active' : ''}>1. Location & rent</span>
        <span className={step === 2 ? 'is-active' : ''}>2. Optional costs</span>
        <span className={step === 3 ? 'is-active' : ''}>3. Lease agreement</span>
      </div>

      {(localError || error) && (
        <p className="unit-onboard-error">{localError || error}</p>
      )}

      {step === 1 ? (
        <form className="unit-onboard-grid" onSubmit={goNextFrom1}>
          <label>
            Street address
            <input
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              required
            />
          </label>
          <label>
            Suburb / town
            <input value={suburb} onChange={(e) => setSuburb(e.target.value)} required />
          </label>
          <label>
            Province
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            ZIP / postal code
            <input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              required
            />
          </label>
          <label>
            Unit number
            <input
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              required
            />
          </label>
          <label>
            Monthly rent
            <input
              type="number"
              min={0}
              value={rent}
              onChange={(e) => setRent(e.target.value)}
              required
            />
          </label>
          <label>
            Deposit
            <input
              type="number"
              min={0}
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              required
            />
          </label>
          {showLandlord ? (
            <label>
              Landlord
              <select
                value={landlordId}
                onChange={(e) => setLandlordId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {landlords!.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="unit-onboard-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Next
            </button>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <form className="unit-onboard-grid" onSubmit={goNextFrom2}>
          <p className="unit-onboard-hint">
            Optional — you can skip these and add them later from the unit summary.
          </p>
          <label>
            Levies (monthly)
            <input
              type="number"
              min={0}
              step="0.01"
              value={levies}
              onChange={(e) => setLevies(e.target.value)}
            />
          </label>
          <label>
            Municipal rate (monthly)
            <input
              type="number"
              min={0}
              step="0.01"
              value={municipal}
              onChange={(e) => setMunicipal(e.target.value)}
            />
          </label>
          <label>
            Bond / purchase price
            <input
              type="number"
              min={0}
              step="0.01"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
            />
          </label>
          <label>
            Amount owed to bank
            <input
              type="number"
              min={0}
              step="0.01"
              value={bankOwed}
              onChange={(e) => setBankOwed(e.target.value)}
            />
          </label>
          <div className="unit-onboard-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="submit" className="btn btn-primary">
              Next
            </button>
          </div>
        </form>
      ) : null}

      {step === 3 ? (
        <form className="unit-onboard-grid unit-onboard-lease" onSubmit={(e) => void finish(e)}>
          <p className="unit-onboard-hint">
            Required — choose the platform lease template (with optional special clauses) or
            upload your own lease PDF.
          </p>

          <fieldset className="unit-onboard-lease-mode">
            <legend>Lease source</legend>
            <label className="unit-onboard-radio">
              <input
                type="radio"
                name="leaseMode"
                checked={leaseMode === 'template'}
                onChange={() => setLeaseMode('template')}
              />
              <span>Use platform template + optional special clauses</span>
            </label>
            <label className="unit-onboard-radio">
              <input
                type="radio"
                name="leaseMode"
                checked={leaseMode === 'upload'}
                onChange={() => setLeaseMode('upload')}
              />
              <span>Upload my own lease agreement (PDF)</span>
            </label>
          </fieldset>

          {leaseMode === 'upload' ? (
            <label className="unit-onboard-span">
              Lease PDF
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => void onLeasePdfSelected(e.target.files?.[0] ?? null)}
              />
              {leasePdfName ? (
                <span className="unit-onboard-hint">Selected: {leasePdfName}</span>
              ) : null}
            </label>
          ) : (
            <>
              <div className="unit-onboard-span unit-onboard-clauses">
                <p className="unit-onboard-hint">
                  Select special clause topics to add. Full wording is applied when the lease
                  is generated for an application.
                </p>
                {CLAUSE_CATALOG.map((clause) => {
                  const on = selectedClauses.includes(clause.id)
                  return (
                    <div key={clause.id} className="unit-onboard-clause">
                      <label className="unit-onboard-radio">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleClause(clause.id)}
                        />
                        <span>
                          <strong>{clause.subject}</strong>
                          <small>{clause.hint}</small>
                        </span>
                      </label>
                      {on && clause.id === 'noticePeriod' ? (
                        <label>
                          Notice months
                          <input
                            type="number"
                            min={1}
                            value={noticeMonths}
                            onChange={(e) => setNoticeMonths(e.target.value)}
                          />
                        </label>
                      ) : null}
                      {on && clause.id === 'pets' ? (
                        <div className="unit-onboard-clause-extras">
                          <label className="unit-onboard-radio">
                            <input
                              type="checkbox"
                              checked={petsAllowed}
                              onChange={(e) => setPetsAllowed(e.target.checked)}
                            />
                            <span>Pets allowed (with conditions)</span>
                          </label>
                          <label>
                            Optional note
                            <input
                              value={petsNote}
                              onChange={(e) => setPetsNote(e.target.value)}
                              placeholder="e.g. one small dog, no cats"
                            />
                          </label>
                        </div>
                      ) : null}
                      {on && clause.id === 'parking' ? (
                        <label>
                          Parking bay / description
                          <input
                            value={parkingBay}
                            onChange={(e) => setParkingBay(e.target.value)}
                            placeholder="Bay 12 / basement"
                          />
                        </label>
                      ) : null}
                      {on && clause.id === 'occupancyGuests' ? (
                        <label>
                          Max permanent occupants
                          <input
                            type="number"
                            min={1}
                            value={maxOccupants}
                            onChange={(e) => setMaxOccupants(e.target.value)}
                          />
                        </label>
                      ) : null}
                      {on && clause.id === 'earlyTermination' ? (
                        <div className="unit-onboard-clause-extras">
                          <label>
                            Notice months
                            <input
                              type="number"
                              min={1}
                              value={earlyTerminationMonths}
                              onChange={(e) => setEarlyTerminationMonths(e.target.value)}
                            />
                          </label>
                          <label>
                            Optional fee / contribution
                            <input
                              value={earlyTerminationFee}
                              onChange={(e) => setEarlyTerminationFee(e.target.value)}
                              placeholder="e.g. R5 000 or 1 month rent"
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              <div className="unit-onboard-span">
                <div className="unit-onboard-custom-head">
                  <strong>Custom free-text clauses</strong>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() =>
                      setCustomClauses((prev) => [
                        ...prev,
                        {
                          id: `custom-${Date.now()}`,
                          title: '',
                          body: '',
                        },
                      ])
                    }
                  >
                    Add custom clause
                  </button>
                </div>
                {customClauses.length === 0 ? (
                  <p className="unit-onboard-hint">Optional — add any clause not listed above.</p>
                ) : null}
                {customClauses.map((c, index) => (
                  <div key={c.id} className="unit-onboard-custom">
                    <label>
                      Title
                      <input
                        value={c.title}
                        onChange={(e) => {
                          const title = e.target.value
                          setCustomClauses((prev) =>
                            prev.map((row, i) => (i === index ? { ...row, title } : row)),
                          )
                        }}
                        placeholder="Short subject"
                      />
                    </label>
                    <label>
                      Clause text
                      <textarea
                        rows={3}
                        value={c.body}
                        onChange={(e) => {
                          const body = e.target.value
                          setCustomClauses((prev) =>
                            prev.map((row, i) => (i === index ? { ...row, body } : row)),
                          )
                        }}
                        placeholder="Full wording for this custom clause…"
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-compact"
                      onClick={() =>
                        setCustomClauses((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="unit-onboard-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>
              Back
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save unit'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

export { emptyLeaseConfig } from '../lease'

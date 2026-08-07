import { useState, type FormEvent } from 'react'
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
}

type LandlordOption = { id: string; name: string }

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
  const [step, setStep] = useState<1 | 2>(1)
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
  const [localError, setLocalError] = useState<string | null>(null)

  const showLandlord = !lockedLandlordId && (landlords?.length ?? 0) > 0

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

  function goNext(e: FormEvent) {
    e.preventDefault()
    const err = validateStep1()
    if (err) {
      setLocalError(err)
      return
    }
    setLocalError(null)
    setStep(2)
  }

  async function finish(e: FormEvent) {
    e.preventDefault()
    const err = validateStep1()
    if (err) {
      setLocalError(err)
      setStep(1)
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
    })
  }

  return (
    <div className="unit-onboard">
      <div className="unit-onboard-steps" aria-label="Form steps">
        <span className={step === 1 ? 'is-active' : ''}>1. Location & rent</span>
        <span className={step === 2 ? 'is-active' : ''}>2. Optional costs</span>
      </div>

      {(localError || error) && (
        <p className="unit-onboard-error">{localError || error}</p>
      )}

      {step === 1 ? (
        <form className="unit-onboard-grid" onSubmit={goNext}>
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
      ) : (
        <form className="unit-onboard-grid" onSubmit={(e) => void finish(e)}>
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
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save unit'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

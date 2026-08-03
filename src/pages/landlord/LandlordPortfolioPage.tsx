import { useEffect, useState } from 'react'
import { setUnitTicketManager, fetchLandlordPortfolio } from '../../data/api'
import { formatMoney } from '../../data/utils'

export default function LandlordPortfolioPage() {
  const [units, setUnits] = useState<Array<Record<string, unknown>>>([])
  const [landlord, setLandlord] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function load() {
    try {
      const r = await fetchLandlordPortfolio()
      setUnits(r.data.units)
      setLandlord(r.data.landlord)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onHandoff(unitId: string, ticketManager: 'landlord' | 'agent') {
    setSavingId(unitId)
    setError(null)
    try {
      await setUnitTicketManager(unitId, ticketManager)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update management')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Portfolio</h1>
          <p>
            {landlord
              ? `Units and tenants for ${String(landlord.name)}.`
              : 'Summary of your rented units and tenants.'}
          </p>
        </div>
      </header>
      {error ? <p className="login-error">{error}</p> : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Status</th>
              <th>Rent</th>
              <th>Tenant</th>
              <th>Open tickets</th>
              <th>Ticket management</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={String(u.id)}>
                <td>
                  {String(u.buildingName)} · {String(u.unitNumber)}
                  <br />
                  <small>{String(u.buildingAddress)}</small>
                </td>
                <td>{String(u.status)}</td>
                <td>{formatMoney(Number(u.rent) || 0)}</td>
                <td>
                  {u.tenantName ? (
                    <>
                      {String(u.tenantName)}
                      <br />
                      <small>{String(u.tenantStatus)}</small>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{String(u.openIssues ?? 0)}</td>
                <td>
                  <select
                    value={String(u.ticketManager ?? 'landlord')}
                    disabled={savingId === String(u.id) || !u.tenantId}
                    onChange={(e) =>
                      void onHandoff(
                        String(u.id),
                        e.target.value as 'landlord' | 'agent',
                      )
                    }
                  >
                    <option value="landlord">Landlord manages</option>
                    <option value="agent">Delegate to agent</option>
                  </select>
                  {!u.tenantId ? (
                    <small style={{ display: 'block' }}>Available after a tenant is active</small>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {units.length === 0 ? <div className="empty-state">No units linked yet.</div> : null}
      </div>
    </div>
  )
}

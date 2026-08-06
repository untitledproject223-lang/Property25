import { useEffect, useState } from 'react'
import { setUnitTicketManager, fetchLandlordPortfolio } from '../../data/api'
import { formatDate, formatMoney, nextMonthEndDate } from '../../data/utils'

export default function LandlordPortfolioPage() {
  const [units, setUnits] = useState<Array<Record<string, unknown>>>([])
  const [landlord, setLandlord] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const monthEndDue = nextMonthEndDate()

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
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
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

  const occupied = units.filter((u) => u.tenantId)
  const vacant = units.filter((u) => !u.tenantId)

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Tenants & units</h1>
          <p>
            {landlord
              ? `Active tenants and the units they occupy for ${String(landlord.name)}.`
              : 'Active tenants from completed applications and the units they occupy.'}
          </p>
        </div>
      </header>
      {error ? <p className="login-error">{error}</p> : null}

      <section style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>Current tenants</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Unit</th>
                <th>Lease</th>
                <th>Rent</th>
                <th>Next due</th>
                <th>Deposit balance</th>
                <th>Open tickets</th>
                <th>Ticket management</th>
              </tr>
            </thead>
            <tbody>
              {occupied.map((u) => (
                <tr key={String(u.id)}>
                  <td>
                    <strong>{String(u.tenantName)}</strong>
                    <br />
                    <small>
                      {String(u.tenantEmail)}
                      {u.tenantPhone ? ` · ${String(u.tenantPhone)}` : ''}
                    </small>
                    <br />
                    <span className="badge">{String(u.tenantStatus)}</span>
                  </td>
                  <td>
                    {String(u.buildingName)} · Unit {String(u.unitNumber)}
                    <br />
                    <small>{String(u.buildingAddress)}</small>
                  </td>
                  <td>
                    {String(u.leaseStart ?? '—')} → {String(u.leaseEnd ?? '—')}
                  </td>
                  <td>{formatMoney(Number(u.rent) || 0)}</td>
                  <td>{formatDate(monthEndDue)}</td>
                  <td>
                    {formatMoney(
                      Number(
                        u.depositBalance != null ? u.depositBalance : u.deposit,
                      ) || 0,
                    )}
                  </td>
                  <td>{String(u.openIssues ?? 0)}</td>
                  <td>
                    <select
                      value={String(u.ticketManager ?? 'landlord')}
                      disabled={savingId === String(u.id)}
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {occupied.length === 0 ? (
            <div className="empty-state">
              No tenants yet. Tenants appear here after an application is completed.
            </div>
          ) : null}
        </div>
      </section>

      {vacant.length > 0 ? (
        <section>
          <h2 style={{ marginBottom: '0.75rem' }}>Vacant units</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Status</th>
                  <th>Rent</th>
                </tr>
              </thead>
              <tbody>
                {vacant.map((u) => (
                  <tr key={String(u.id)}>
                    <td>
                      {String(u.buildingName)} · Unit {String(u.unitNumber)}
                      <br />
                      <small>{String(u.buildingAddress)}</small>
                    </td>
                    <td>{String(u.status)}</td>
                    <td>{formatMoney(Number(u.rent) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}

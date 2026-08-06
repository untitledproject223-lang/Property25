import { useEffect, useState } from 'react'
import {
  setUnitTicketManager,
  fetchLandlordPortfolio,
  createUnitAgentInvite,
  terminateLease,
} from '../../data/api'
import { formatDate, formatMoney, nextMonthEndDate } from '../../data/utils'
import TerminateLeaseModal from '../../components/TerminateLeaseModal'

export default function LandlordPortfolioPage() {
  const [units, setUnits] = useState<Array<Record<string, unknown>>>([])
  const [landlord, setLandlord] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [agentInviteUrl, setAgentInviteUrl] = useState<string | null>(null)
  const [terminating, setTerminating] = useState<Record<string, unknown> | null>(null)
  const [terminateBusy, setTerminateBusy] = useState(false)
  const [terminateError, setTerminateError] = useState<string | null>(null)
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

  async function onChangeAgent(unitId: string) {
    setSavingId(unitId)
    setError(null)
    setAgentInviteUrl(null)
    try {
      const result = await createUnitAgentInvite(unitId)
      setAgentInviteUrl(result.data.inviteUrl)
      await navigator.clipboard.writeText(result.data.inviteUrl).catch(() => undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create agent invite link')
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
          <h1>Dashboard</h1>
          <p>
            {landlord
              ? `Active tenants and the units they occupy for ${String(landlord.name)}.`
              : 'Active tenants from completed applications and the units they occupy.'}
          </p>
        </div>
      </header>
      {error ? <p className="login-error">{error}</p> : null}
      {agentInviteUrl ? (
        <p className="role-callout role-agent" role="status" style={{ marginBottom: '1rem' }}>
          <strong>Agent invite link (copied if clipboard allowed)</strong>
          <span style={{ wordBreak: 'break-all' }}>{agentInviteUrl}</span>
          <span className="field-hint">
            Share this link with an agent. They sign in with their normal login and accept the
            unit to receive admin rights.
          </span>
        </p>
      ) : null}

      <section style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>Current tenants</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Unit</th>
                <th>Lease term</th>
                <th>Rent</th>
                <th>Balance</th>
                <th>Next due</th>
                <th>Deposit balance</th>
                <th>Open tickets</th>
                <th>Ticket management</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {occupied.map((u) => {
                const hasAgent = Boolean(u.managingAgentId)
                return (
                  <tr key={String(u.id)}>
                    <td>
                      <strong>{String(u.tenantName)}</strong>
                    </td>
                    <td>
                      {String(u.buildingName)} · Unit {String(u.unitNumber)}
                      <br />
                      <small>{String(u.buildingAddress)}</small>
                    </td>
                    <td>
                      {formatDate(String(u.leaseStart ?? ''))} →{' '}
                      {formatDate(String(u.leaseEnd ?? ''))}
                    </td>
                    <td>{formatMoney(Number(u.rent) || 0)}</td>
                    <td>{formatMoney(Number(u.balance) || 0)}</td>
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
                      <div style={{ display: 'grid', gap: '0.35rem', minWidth: '12rem' }}>
                        {hasAgent ? (
                          <small>
                            Current agent: {String(u.managingAgentName || 'Assigned')}
                          </small>
                        ) : (
                          <small>No agent assigned</small>
                        )}
                        <select
                          value={String(u.ticketManager ?? 'landlord')}
                          disabled={savingId === String(u.id)}
                          onChange={(e) => {
                            const value = e.target.value
                            if (value === 'change-agent') {
                              void onChangeAgent(String(u.id))
                              return
                            }
                            void onHandoff(String(u.id), value as 'landlord' | 'agent')
                          }}
                        >
                          <option value="landlord">Landlord manages</option>
                          {hasAgent ? (
                            <option value="agent">Stay with current agent</option>
                          ) : null}
                          <option value="change-agent">
                            {hasAgent ? 'Change agent (invite link)' : 'Assign agent (invite link)'}
                          </option>
                        </select>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-compact"
                        onClick={() => {
                          setTerminateError(null)
                          setTerminating(u)
                        }}
                      >
                        Terminate lease
                      </button>
                    </td>
                  </tr>
                )
              })}
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
                  <th>Agent admin</th>
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
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-compact"
                        disabled={savingId === String(u.id)}
                        onClick={() => void onChangeAgent(String(u.id))}
                      >
                        {u.managingAgentId ? 'Change agent' : 'Assign agent'}
                      </button>
                      {u.managingAgentName ? (
                        <div>
                          <small>{String(u.managingAgentName)}</small>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {terminating ? (
        <TerminateLeaseModal
          tenantName={String(terminating.tenantName)}
          unitLabel={`${String(terminating.buildingName)} Unit ${String(terminating.unitNumber)}`}
          busy={terminateBusy}
          error={terminateError}
          onCancel={() => {
            if (terminateBusy) return
            setTerminating(null)
            setTerminateError(null)
          }}
          onConfirm={async (payload) => {
            setTerminateBusy(true)
            setTerminateError(null)
            try {
              await terminateLease(String(terminating.tenantId), payload, {
                asLandlord: true,
              })
              setTerminating(null)
              await load()
            } catch (e) {
              setTerminateError(
                e instanceof Error ? e.message : 'Could not terminate lease',
              )
            } finally {
              setTerminateBusy(false)
            }
          }}
        />
      ) : null}
    </div>
  )
}

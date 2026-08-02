import { useEffect, useState } from 'react'
import { downloadDocument, listDocuments, type DocumentMeta } from '../data/api'

interface TenantDocsActionsProps {
  tenantId: string
}

export function TenantDocsActions({ tenantId }: TenantDocsActionsProps) {
  const [docs, setDocs] = useState<DocumentMeta[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setDocs(null)
    setError('')
    listDocuments({ tenantId })
      .then((res) => {
        if (!cancelled) setDocs(res.data)
      })
      .catch((err) => {
        if (!cancelled) {
          setDocs([])
          setError(err instanceof Error ? err.message : 'Could not load docs')
        }
      })
    return () => {
      cancelled = true
    }
  }, [tenantId])

  async function downloadAll() {
    if (!docs?.length) return
    setBusy(true)
    setError('')
    try {
      for (const doc of docs) {
        await downloadDocument(doc.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setBusy(false)
    }
  }

  if (docs === null) {
    return <span className="muted" style={{ fontSize: '0.78rem' }}>…</span>
  }

  if (!docs.length) {
    return (
      <span className="muted" style={{ fontSize: '0.78rem' }} title={error || undefined}>
        No docs
      </span>
    )
  }

  return (
    <div className="doc-actions">
      <button
        type="button"
        className="btn-contact"
        disabled={busy}
        onClick={() => void downloadAll()}
        title={`Download ${docs.length} application document${docs.length === 1 ? '' : 's'}`}
      >
        {busy ? '…' : `Download (${docs.length})`}
      </button>
      {error ? (
        <span className="muted" style={{ fontSize: '0.7rem', color: '#9b2c2c' }}>
          {error}
        </span>
      ) : null}
    </div>
  )
}

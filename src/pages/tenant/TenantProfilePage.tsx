import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  changePassword,
  downloadDocument,
  fetchTenantProfile,
  fileToBase64,
  listDocuments,
  updateTenantProfile,
  uploadTenantAvatar,
  type DocumentMeta,
} from '../../data/api'

export default function TenantProfilePage() {
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)
  const [docs, setDocs] = useState<DocumentMeta[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [editing, setEditing] = useState<'name' | 'phone' | 'whatsapp' | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const r = await fetchTenantProfile()
    setProfile(r.data)
    setName(String(r.data.displayName ?? r.data.name ?? ''))
    setPhone(String(r.data.phone ?? ''))
    setWhatsapp(String(r.data.whatsapp ?? ''))

    const tenantId = r.data.tenantId ? String(r.data.tenantId) : ''
    const applicationId = r.data.applicationId ? String(r.data.applicationId) : ''
    const lists = await Promise.all([
      tenantId ? listDocuments({ tenantId }).catch(() => ({ data: [] as DocumentMeta[] })) : { data: [] },
      applicationId
        ? listDocuments({ applicationId }).catch(() => ({ data: [] as DocumentMeta[] }))
        : { data: [] },
    ])
    const merged = new Map<string, DocumentMeta>()
    for (const doc of [...lists[0].data, ...lists[1].data]) {
      merged.set(doc.id, doc)
    }
    setDocs(Array.from(merged.values()))
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  async function saveField(field: 'name' | 'phone' | 'whatsapp') {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await updateTenantProfile({
        name: field === 'name' ? name : undefined,
        phone: field === 'phone' ? phone : undefined,
        whatsapp: field === 'whatsapp' ? whatsapp : undefined,
      })
      setEditing(null)
      setMessage('Profile updated.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update profile')
    } finally {
      setSaving(false)
    }
  }

  async function onAvatar(file: File | null) {
    if (!file) return
    setSaving(true)
    setError(null)
    try {
      const contentBase64 = await fileToBase64(file)
      await uploadTenantAvatar(contentBase64, file.type || 'image/jpeg')
      setMessage('Profile picture updated.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload picture')
    } finally {
      setSaving(false)
    }
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setMessage('Password changed successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password')
    } finally {
      setSaving(false)
    }
  }

  const leaseDocs = docs.filter((d) =>
    /lease/i.test(d.docType) || /lease/i.test(d.filename),
  )
  const avatarSrc =
    profile?.avatarBase64 && profile?.avatarMime
      ? `data:${String(profile.avatarMime)};base64,${String(profile.avatarBase64)}`
      : null

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Profile</h1>
          <p>Manage your details, password, picture, and documents.</p>
        </div>
      </header>
      {error ? <p className="login-error">{error}</p> : null}
      {message ? <p className="role-callout role-shared">{message}</p> : null}

      {profile ? (
        <>
          <section className="form-section" style={{ marginBottom: '1.25rem' }}>
            <legend>Profile picture</legend>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: '#d0d9e4',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                }}
              >
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  String(profile.displayName ?? profile.name ?? '?')
                    .slice(0, 1)
                    .toUpperCase()
                )}
              </div>
              <label className="btn btn-ghost btn-compact">
                Change picture
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => void onAvatar(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </section>

          <section className="form-section" style={{ marginBottom: '1.25rem' }}>
            <legend>Personal details</legend>
            <ProfileRow
              label="Full name"
              value={String(profile.displayName ?? profile.name ?? '')}
              editing={editing === 'name'}
              onEdit={() => setEditing('name')}
              onCancel={() => setEditing(null)}
              onSave={() => void saveField('name')}
              saving={saving}
            >
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </ProfileRow>
            <div className="field field-span">
              <span className="field-label">Email</span>
              <input className="input-filled-locked" value={String(profile.email)} readOnly />
              <span className="field-hint">Email cannot be changed here.</span>
            </div>
            <ProfileRow
              label="Phone"
              value={String(profile.phone ?? '—')}
              editing={editing === 'phone'}
              onEdit={() => setEditing('phone')}
              onCancel={() => setEditing(null)}
              onSave={() => void saveField('phone')}
              saving={saving}
            >
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </ProfileRow>
            <ProfileRow
              label="WhatsApp"
              value={String(profile.whatsapp ?? '—')}
              editing={editing === 'whatsapp'}
              onEdit={() => setEditing('whatsapp')}
              onCancel={() => setEditing(null)}
              onSave={() => void saveField('whatsapp')}
              saving={saving}
            >
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
            </ProfileRow>
          </section>

          <section className="form-section" style={{ marginBottom: '1.25rem' }}>
            <legend>Change password</legend>
            <form className="form-grid" onSubmit={onPassword}>
              <label className="field">
                <span className="field-label">Current password</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </label>
              <button type="submit" className="btn btn-primary btn-compact" disabled={saving}>
                Update password
              </button>
            </form>
          </section>

          <section className="form-section" style={{ marginBottom: '1.25rem' }}>
            <legend>Lease agreement</legend>
            {leaseDocs.length === 0 ? (
              <p className="field-hint">No lease document is available yet.</p>
            ) : (
              <ul className="file-selected-list">
                {leaseDocs.map((doc) => (
                  <li key={doc.id}>
                    {doc.filename}{' '}
                    <button
                      type="button"
                      className="btn btn-ghost btn-compact"
                      onClick={() => void downloadDocument(doc.id)}
                    >
                      Download lease
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="form-section">
            <legend>Application documents</legend>
            {docs.length === 0 ? (
              <p className="field-hint">No documents uploaded yet.</p>
            ) : (
              <ul className="file-selected-list">
                {docs.map((doc) => (
                  <li key={doc.id}>
                    {doc.docType} — {doc.filename}{' '}
                    <button
                      type="button"
                      className="btn btn-ghost btn-compact"
                      onClick={() => void downloadDocument(doc.id)}
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

function ProfileRow({
  label,
  value,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
  children,
}: {
  label: string
  value: string
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
  children: ReactNode
}) {
  return (
    <div className="field field-span">
      <span className="field-label">{label}</span>
      {editing ? (
        <>
          {children}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
            <button type="button" className="btn btn-primary btn-compact" disabled={saving} onClick={onSave}>
              Save
            </button>
            <button type="button" className="btn btn-ghost btn-compact" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <input className="input-filled-locked" value={value} readOnly />
          <button type="button" className="btn btn-ghost btn-compact" onClick={onEdit}>
            Edit
          </button>
        </div>
      )}
    </div>
  )
}

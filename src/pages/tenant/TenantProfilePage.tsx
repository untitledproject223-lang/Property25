import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  changePassword,
  downloadDocument,
  downloadTenantLease,
  fetchTenantProfile,
  fileToBase64,
  listDocuments,
  updateTenantProfile,
  uploadTenantAvatar,
  type DocumentMeta,
} from '../../data/api'
import '../../components/forms/forms.css'

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
  const [leaseBusy, setLeaseBusy] = useState(false)

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
        <div className="profile-layout">
          <section className="panel">
            <div className="panel-header">
              <h2>Profile picture</h2>
            </div>
            <div className="panel-body profile-avatar-row">
              <div className="profile-avatar" aria-hidden="true">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" />
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

          <section className="panel">
            <div className="panel-header">
              <h2>Personal details</h2>
            </div>
            <div className="panel-body form-grid profile-form-grid">
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
              <label className="field field-span">
                <span className="field-label">Email</span>
                <input
                  className="input-filled-locked"
                  value={String(profile.email)}
                  readOnly
                />
                <span className="field-hint">Email cannot be changed here.</span>
              </label>
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
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Change password</h2>
            </div>
            <form className="panel-body form-grid profile-form-grid" onSubmit={onPassword}>
              <label className="field field-span">
                <span className="field-label">Current password</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </label>
              <label className="field field-span">
                <span className="field-label">New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </label>
              <div className="field field-span">
                <button type="submit" className="btn btn-primary btn-compact" disabled={saving}>
                  Update password
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Lease agreement</h2>
            </div>
            <div className="panel-body">
              {profile.tenantId ? (
                <div className="btn-row" style={{ marginBottom: leaseDocs.length ? '0.75rem' : 0 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-compact"
                    disabled={leaseBusy}
                    onClick={() => {
                      setLeaseBusy(true)
                      setError(null)
                      void downloadTenantLease(String(profile.tenantId))
                        .catch((err) => {
                          setError(
                            err instanceof Error ? err.message : 'Could not download lease',
                          )
                        })
                        .finally(() => setLeaseBusy(false))
                    }}
                  >
                    {leaseBusy ? 'Preparing…' : 'Download lease agreement'}
                  </button>
                </div>
              ) : null}
              {leaseDocs.length === 0 ? (
                <p className="muted">
                  {profile.tenantId
                    ? 'Your signed lease is available via the button above.'
                    : 'No lease document is available yet.'}
                </p>
              ) : (
                <ul className="profile-doc-list">
                  {leaseDocs.map((doc) => (
                    <li key={doc.id}>
                      <span>{doc.filename}</span>
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
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Application documents</h2>
            </div>
            <div className="panel-body">
              {docs.length === 0 ? (
                <p className="muted">No documents uploaded yet.</p>
              ) : (
                <ul className="profile-doc-list">
                  {docs.map((doc) => (
                    <li key={doc.id}>
                      <span>
                        {doc.docType} — {doc.filename}
                      </span>
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
            </div>
          </section>
        </div>
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
          <div className="profile-row-actions">
            <button
              type="button"
              className="btn btn-primary btn-compact"
              disabled={saving}
              onClick={onSave}
            >
              Save
            </button>
            <button type="button" className="btn btn-ghost btn-compact" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="profile-row-static">
          <input className="input-filled-locked" value={value} readOnly />
          <button type="button" className="btn btn-ghost btn-compact" onClick={onEdit}>
            Edit
          </button>
        </div>
      )}
    </div>
  )
}

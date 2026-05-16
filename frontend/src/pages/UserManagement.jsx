import { useState, useEffect } from 'react'
import client from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { formatDate } from '../utils/constants'
import { RoleBadge } from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import { SkeletonTable } from '../components/Skeleton'

const EMPTY_FORM = {
  username: '',
  password: '',
  nama_lengkap: '',
  email: '',
  role: 'Teknisi',
}

function UserModal({ user, onClose, onSaved }) {
  const isEdit = !!user
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user) {
      setForm({
        username: user.username || '',
        password: '',
        nama_lengkap: user.nama_lengkap || '',
        email: user.email || '',
        role: user.role || 'Teknisi',
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [user])

  const setField = (key) => (val) => setForm((prev) => ({ ...prev, [key]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const payload = { ...form }
      if (isEdit && !payload.password) {
        delete payload.password // don't reset password if blank on edit
      }
      const res = isEdit
        ? await client.patch(`/users/${user.id}/`, payload)
        : await client.post('/users/', payload)
      onSaved?.(res.data)
      onClose?.()
    } catch (err) {
      const detail = err?.response?.data
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Gagal menyimpan pengguna')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 my-8 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            {isEdit ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700">Username *</label>
            <input
              className="form-input mt-1"
              value={form.username}
              onChange={(e) => setField('username')(e.target.value)}
              required
              disabled={isEdit}
              autoComplete="off"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">
              Password {isEdit && <span className="text-xs text-gray-400">(kosongkan jika tidak ingin diubah)</span>}
              {!isEdit && ' *'}
            </label>
            <input
              type="password"
              className="form-input mt-1"
              value={form.password}
              onChange={(e) => setField('password')(e.target.value)}
              required={!isEdit}
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Nama Lengkap *</label>
            <input
              className="form-input mt-1"
              value={form.nama_lengkap}
              onChange={(e) => setField('nama_lengkap')(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              className="form-input mt-1"
              value={form.email}
              onChange={(e) => setField('email')(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Role *</label>
            <div className="grid grid-cols-2 gap-2">
              {['Teknisi', 'Manajer'].map((r) => (
                <label
                  key={r}
                  className={`flex items-center justify-center p-2 rounded-lg cursor-pointer text-sm transition-all ${
                    form.role === r
                      ? 'border-2 border-blue-500 bg-blue-50 font-semibold text-blue-800'
                      : 'border-2 border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    value={r}
                    checked={form.role === r}
                    onChange={() => setField('role')(r)}
                    className="sr-only"
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={submitting}>
              {submitting ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Tambah Pengguna'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function UserManagement() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null)

  const reload = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await client.get('/users/')
      const items = Array.isArray(res.data) ? res.data : res.data.results || []
      setUsers(items)
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Gagal memuat pengguna')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const toggleActive = async (u) => {
    try {
      await client.patch(`/users/${u.id}/`, { is_active: !u.is_active })
      reload()
    } catch (err) {
      alert('Gagal mengubah status: ' + (err?.response?.data?.detail || err.message))
    }
  }

  const filtered = filterRole ? users.filter((u) => u.role === filterRole) : users

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manajemen Pengguna</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola pengguna dalam organisasi Anda</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + Tambah Pengguna
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          className="form-input max-w-[200px]"
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
        >
          <option value="">Semua Role</option>
          <option value="Manajer">Manajer</option>
          <option value="Teknisi">Teknisi</option>
        </select>
        <span className="text-xs text-gray-500 self-center">{filtered.length} pengguna</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="👥"
          title="Belum ada pengguna"
          description={filterRole
            ? "Tidak ada pengguna dengan role tersebut."
            : "Tambahkan pengguna pertama untuk organisasi Anda."}
          action={
            <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Tambah Pengguna</button>
          }
        />
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="py-3 px-4 font-semibold">Username</th>
                <th className="py-3 px-4 font-semibold">Nama Lengkap</th>
                <th className="py-3 px-4 font-semibold">Email</th>
                <th className="py-3 px-4 font-semibold">Role</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Dibuat</th>
                <th className="py-3 px-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => {
                const isSelf = u.id === currentUser?.id
                return (
                  <tr
                    key={u.id}
                    className={`border-b last:border-b-0 hover:bg-brand-50/40 transition-colors ${
                      i % 2 === 1 ? 'bg-gray-50/40' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-medium text-gray-900">{u.username}</td>
                    <td className="py-3 px-4 text-gray-700">{u.nama_lengkap || '—'}</td>
                    <td className="py-3 px-4 text-gray-600">{u.email || '—'}</td>
                    <td className="py-3 px-4"><RoleBadge role={u.role} size="sm" /></td>
                    <td className="py-3 px-4">
                      {u.is_active === false ? (
                        <span className="pill bg-red-50 text-red-700 ring-1 ring-red-100">
                          <span className="w-1 h-1 rounded-full bg-red-500" />
                          Nonaktif
                        </span>
                      ) : (
                        <span className="pill bg-green-50 text-green-700 ring-1 ring-green-100">
                          <span className="w-1 h-1 rounded-full bg-green-500" />
                          Aktif
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{formatDate(u.created_at)}</td>
                    <td className="py-3 px-4 whitespace-nowrap text-right">
                      <button
                        className="text-xs text-brand-700 hover:underline mr-2 font-medium"
                        onClick={() => setEditing(u)}
                      >
                        Edit
                      </button>
                      {!isSelf && (
                        <button
                          className="text-xs text-gray-600 hover:underline font-medium"
                          onClick={() => toggleActive(u)}
                        >
                          {u.is_active === false ? 'Aktifkan' : 'Nonaktifkan'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <UserModal onClose={() => setShowCreate(false)} onSaved={() => reload()} />
      )}

      {editing && (
        <UserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => reload()}
        />
      )}
    </div>
  )
}

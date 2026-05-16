import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import client from '../api/client'
import { useAuth, useIsManager } from '../auth/AuthContext'
import { formatDateTime } from '../utils/constants'
import PhotoGallery from '../components/PhotoGallery'
import EmptyState from '../components/EmptyState'
import { SkeletonCard, SkeletonTable } from '../components/Skeleton'

const GRACE_MS = 5 * 60 * 1000

const FIELD_LABELS = {
  tgl_inspeksi:          'Tanggal Inspeksi',
  status_air_terminal:   'Air Terminal',
  status_down_conductor: 'Down Conductor',
  status_grounding:      'Grounding',
  resistansi_grounding_ohm: 'Resistansi Grounding (Ω)',
  status_spd:            'SPD',
  arus_bocor_spd_ma:     'Arus Bocor SPD (mA)',
  status_bonding:        'Bonding',
  status_kabel_instalasi:'Kabel Instalasi',
  catatan_teknisi:       'Catatan Teknisi',
}

const ACTION_STYLE = {
  create:      { bg: 'bg-green-100 text-green-700',  label: 'membuat laporan',               dot: '🟢' },
  update:      { bg: 'bg-blue-100 text-blue-700',    label: 'mengedit laporan',               dot: '🔵' },
  amend:       { bg: 'bg-amber-100 text-amber-700',  label: 'membuat amandemen',              dot: '🟡' },
  amended_by:  { bg: 'bg-amber-100 text-amber-700',  label: 'mengamandemen laporan ini',      dot: '🟡' },
  photo_added: { bg: 'bg-gray-100 text-gray-600',    label: 'menambah foto bukti',            dot: '⚪' },
  delete:      { bg: 'bg-red-100 text-red-700',      label: 'memindah ke Tempat Sampah',      dot: '🔴' },
  restore:     { bg: 'bg-green-100 text-green-700',  label: 'memulihkan dari Tempat Sampah',  dot: '🟢' },
  purge:       { bg: 'bg-red-100 text-red-700',      label: 'menghapus laporan permanen',     dot: '🔴' },
}

function StatusChip({ label, value }) {
  const ok = value === 'OK'
  return (
    <span className={`pill ring-1 ${ok ? 'bg-green-50 text-green-700 ring-green-100' : 'bg-red-50 text-red-700 ring-red-100'}`}>
      <span className={`w-1 h-1 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {label}
    </span>
  )
}

function DiffList({ diff }) {
  const entries = Object.entries(diff).filter(([k]) => k !== 'target_log_id' && k !== 'photo_id')
  if (entries.length === 0) return null
  return (
    <div className="mt-1.5 space-y-0.5">
      {entries.map(([field, { old: oldVal, new: newVal }]) => (
        <p key={field} className="text-xs text-gray-500">
          <span className="font-medium text-gray-600">{FIELD_LABELS[field] || field}:</span>{' '}
          <span className="line-through text-red-400">{oldVal ?? '—'}</span>
          {' → '}
          <span className="text-green-600">{newVal ?? '—'}</span>
        </p>
      ))}
    </div>
  )
}

function TimelineEntry({ entry, isLast }) {
  const style = ACTION_STYLE[entry.action] || { bg: 'bg-gray-100 text-gray-600', label: entry.action, dot: '⚪' }
  const targetId = entry.diff?.target_log_id
  return (
    <div className="flex gap-3">
      {/* Track line */}
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-white ${style.bg}`}>
          {style.dot}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-gray-100 mt-1" />}
      </div>

      <div className="flex-1 min-w-0 pb-4">
        <p className="text-sm text-gray-800">
          <span className="font-semibold">{entry.actor_nama || entry.actor_username || 'Sistem'}</span>
          {' '}
          <span className="text-gray-500">{style.label}</span>
          {entry.actor_role && (
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
              entry.actor_role === 'Manajer' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {entry.actor_role}
            </span>
          )}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(entry.at)}</p>
        <DiffList diff={entry.diff || {}} />
        {entry.diff?.photo_id && (
          <p className="text-xs text-gray-400 mt-1">ID Foto: {entry.diff.photo_id.slice(0, 8)}…</p>
        )}
        {targetId && (
          <Link
            to={`/inspections/${targetId}`}
            className="text-xs text-brand-700 hover:underline mt-1 inline-block"
          >
            Lihat log terkait →
          </Link>
        )}
        {entry.note && (
          <p className="text-xs text-gray-400 mt-0.5 italic">{entry.note}</p>
        )}
      </div>
    </div>
  )
}

function DeleteConfirmModal({ log, onConfirm, onCancel }) {
  const purgeDate = new Date()
  purgeDate.setDate(purgeDate.getDate() + 49)
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 flex items-center justify-center p-4 animate-fade-in"
      onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Hapus Laporan?</h3>
        <p className="text-sm text-gray-600 mb-1">
          Laporan akan dipindah ke <strong>Tempat Sampah</strong> dan otomatis dihapus permanen pada:
        </p>
        <p className="text-sm font-semibold text-red-600 mb-4">
          {purgeDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
        <p className="text-xs text-gray-400 mb-4">Anda dapat memulihkannya kapan saja sebelum tanggal tersebut melalui Tempat Sampah.</p>
        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={onCancel}>Batal</button>
          <button className="btn-danger flex-1" onClick={onConfirm}>Ya, Hapus</button>
        </div>
      </div>
    </div>
  )
}

export default function LaporanDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isManager = useIsManager()

  const [log, setLog] = useState(null)
  const [audit, setAudit] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError('')
    Promise.all([
      client.get(`/inspections/${id}/`),
      client.get(`/inspections/${id}/audit/`),
    ])
      .then(([logRes, auditRes]) => {
        setLog(logRes.data)
        setAudit(Array.isArray(auditRes.data) ? auditRes.data : auditRes.data.results || [])
      })
      .catch((err) => {
        setError(err?.response?.data?.detail || err.message || 'Gagal memuat laporan')
      })
      .finally(() => setLoading(false))
  }, [id])

  const isOwn   = user && log?.user === user.id
  const inGrace = log?.created_at && (Date.now() - new Date(log.created_at).getTime()) < GRACE_MS
  const isDeleted = !!log?.deleted_at
  const canEdit  = !isDeleted && ((isOwn && inGrace) || isManager)
  const canAmend = !isDeleted && ((isOwn && !inGrace) || isManager) && !log?.amends

  const handleDelete = async () => {
    setActionLoading(true)
    try {
      await client.delete(`/inspections/${id}/`)
      navigate('/inspections')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Gagal menghapus laporan')
      setShowDeleteModal(false)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRestore = async () => {
    setActionLoading(true)
    try {
      const res = await client.post(`/inspections/${id}/restore/`)
      setLog(res.data)
      // Reload audit trail
      const auditRes = await client.get(`/inspections/${id}/audit/`)
      setAudit(Array.isArray(auditRes.data) ? auditRes.data : auditRes.data.results || [])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Gagal memulihkan laporan')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard className="h-20" />
        <SkeletonCard className="h-64" />
        <SkeletonTable rows={4} />
      </div>
    )
  }

  if (error && !log) {
    return (
      <EmptyState
        icon="📋"
        title="Laporan tidak ditemukan"
        description={error}
        action={
          <button className="btn-primary" onClick={() => navigate('/inspections')}>
            Kembali ke daftar
          </button>
        }
      />
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Breadcrumb + back */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => navigate('/inspections')} className="hover:text-brand-700 transition-colors">
          ← Riwayat Inspeksi
        </button>
        <span>/</span>
        <span className="text-gray-700 truncate">{log?.asset_nama_gedung}</span>
      </div>

      {/* Soft-delete banner */}
      {isDeleted && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-800">Laporan ini ada di Tempat Sampah</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Akan dihapus permanen pada {formatDateTime(log.purge_at)}.
              Anda dapat memulihkannya sebelum tanggal tersebut.
            </p>
          </div>
          {isManager && (
            <button
              className="btn-secondary text-sm shrink-0"
              onClick={handleRestore}
              disabled={actionLoading}
            >
              Pulihkan
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
      )}

      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{log?.asset_nama_gedung}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Inspeksi · {formatDateTime(log?.tgl_inspeksi)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && (
              <button
                className="btn-secondary text-sm"
                onClick={() => navigate(`/inspections/new?edit=${log.log_id}`)}
              >
                Edit
              </button>
            )}
            {canAmend && (
              <button
                className="btn-secondary text-sm"
                onClick={() => navigate(`/inspections/new?amend=${log.log_id}`)}
              >
                Amandemen
              </button>
            )}
            {isManager && !isDeleted && (
              <button
                className="btn-danger text-sm"
                onClick={() => setShowDeleteModal(true)}
                disabled={actionLoading}
              >
                Hapus
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-800">Detail Inspeksi</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400">Dibuat oleh</p>
            <p className="font-medium">{log?.user_nama || log?.user_username || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Dibuat pada</p>
            <p className="font-medium">{formatDateTime(log?.created_at)}</p>
          </div>
          {log?.updated_by_nama && log.updated_by !== log.user && (
            <>
              <div>
                <p className="text-xs text-gray-400">Diedit terakhir oleh</p>
                <p className="font-medium">{log.updated_by_nama}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Waktu edit terakhir</p>
                <p className="font-medium">{formatDateTime(log.updated_at)}</p>
              </div>
            </>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-2">Komponen Wajib</p>
          <div className="flex flex-wrap gap-2">
            <StatusChip label="Air Terminal" value={log?.status_air_terminal} />
            <StatusChip label="Down Conductor" value={log?.status_down_conductor} />
            <StatusChip label="Grounding" value={log?.status_grounding} />
          </div>
          {log?.resistansi_grounding_ohm != null && (
            <p className="text-xs text-gray-500 mt-1">Resistansi Grounding: {log.resistansi_grounding_ohm} Ω</p>
          )}
        </div>

        {(log?.status_spd || log?.status_bonding || log?.status_kabel_instalasi) && (
          <div>
            <p className="text-xs text-gray-400 mb-2">Komponen Tambahan</p>
            <div className="flex flex-wrap gap-2">
              {log.status_spd && <StatusChip label="SPD" value={log.status_spd} />}
              {log.status_bonding && <StatusChip label="Bonding" value={log.status_bonding} />}
              {log.status_kabel_instalasi && <StatusChip label="Kabel" value={log.status_kabel_instalasi} />}
            </div>
          </div>
        )}

        {log?.catatan_teknisi && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Catatan Teknisi</p>
            <p className="text-sm bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{log.catatan_teknisi}</p>
          </div>
        )}

        {/* Amendment chain */}
        {log?.amends && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
            📝 Log ini adalah <strong>amandemen</strong> dari{' '}
            <Link to={`/inspections/${log.amends}`} className="text-brand-700 hover:underline">
              log asal →
            </Link>
          </div>
        )}
        {log?.amendments?.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm space-y-1">
            <p>↳ Log ini telah diamandemen {log.amendments.length} kali.</p>
            {log.amendments.map((aid) => (
              <Link key={aid} to={`/inspections/${aid}`} className="block text-xs text-brand-700 hover:underline">
                Lihat amandemen {aid.slice(0, 8)}… →
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Photos */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-3">Foto Bukti</h2>
        <PhotoGallery photos={log?.photos} />
      </div>

      {/* Timeline */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4">Riwayat Aktivitas</h2>
        {audit.length === 0 ? (
          <EmptyState
            icon="🕒"
            title="Belum ada riwayat"
            description="Riwayat perubahan laporan ini akan muncul di sini."
          />
        ) : (
          <div>
            {audit.map((entry, i) => (
              <TimelineEntry key={entry.audit_id} entry={entry} isLast={i === audit.length - 1} />
            ))}
          </div>
        )}
      </div>

      {showDeleteModal && (
        <DeleteConfirmModal
          log={log}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  )
}

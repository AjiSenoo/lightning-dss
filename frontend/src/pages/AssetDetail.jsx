import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts'
import StrikeChart from '../components/StrikeChart'
import HealthTrend from '../components/HealthTrend'
import { HealthGaugeInline } from '../components/HealthGauge'
import { UrgencyBadge } from '../components/StatusBadge'
import AssetForm from '../components/AssetForm'
import { LPL_LABELS, formatDate, formatDateTime, getHealthStatus, timeAgo } from '../utils/constants'
import cacheStore from '../offline/cacheStore'
import client from '../api/client'
import { useAuth, useIsManager } from '../auth/AuthContext'

const GRACE_MS = 5 * 60 * 1000

const AUDIT_DOT = {
  create:  'bg-green-500',
  update:  'bg-blue-500',
  delete:  'bg-red-400',
  restore: 'bg-brand-500',
  purge:   'bg-gray-400',
}

const AUDIT_LABEL = {
  create:  'menambahkan aset',
  update:  'mengedit aset',
  delete:  'memindah ke Tempat Sampah',
  restore: 'memulihkan aset',
  purge:   'menghapus permanen',
}

function StatusChip({ label, value }) {
  const ok = value === 'OK'
  return (
    <span className={`pill ring-1 text-[10px] py-0 ${
      ok ? 'bg-green-50 text-green-700 ring-green-100' : 'bg-red-50 text-red-700 ring-red-100'
    }`}>
      <span className={`w-1 h-1 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {label}
    </span>
  )
}

function DiffPreview({ diff }) {
  const entries = Object.entries(diff).filter(([, v]) => v && typeof v === 'object' && 'old' in v)
  if (entries.length === 0) return null
  return (
    <ul className="mt-1 space-y-0.5">
      {entries.map(([field, { old: o, new: n }]) => (
        <li key={field} className="text-xs text-gray-500">
          <span className="font-medium text-gray-600">{field}:</span>{' '}
          <span className="line-through text-red-400">{o ?? '—'}</span>
          {' → '}
          <span className="text-green-600">{n ?? '—'}</span>
        </li>
      ))}
    </ul>
  )
}

function CollapsibleDiff({ diff }) {
  const [expanded, setExpanded] = useState(false)
  const entries = Object.entries(diff || {}).filter(([, v]) => v && typeof v === 'object' && 'old' in v)
  if (entries.length === 0) return null
  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-brand-700 hover:underline mt-1"
      >
        {expanded ? '▼ Sembunyikan detail' : '▶ Lihat detail'}
      </button>
      {expanded && <DiffPreview diff={diff} />}
    </div>
  )
}

function inspectionEligibility(log, currentUserId, isManager) {
  const isOwn = currentUserId && log.user === currentUserId
  const inGrace = log.created_at && (Date.now() - new Date(log.created_at).getTime()) < GRACE_MS
  const canEdit = !log.verified_at && ((isOwn && inGrace) || isManager)
  const canAmend = ((isOwn && !inGrace) || isManager) && !log.amends
  return { canEdit, canAmend }
}

export default function AssetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isManager = useIsManager()
  const { user } = useAuth()
  const [asset, setAsset] = useState(null)
  const [history, setHistory] = useState([])
  const [audits, setAudits] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const load = async () => {
    setLoading(true)
    const [assetResult, histResult, auditRes] = await Promise.all([
      cacheStore.getAsset(id),
      cacheStore.getAssetHistory(id),
      client.get(`/assets/${id}/audits/`).catch(() => ({ data: [] })),
    ])
    setAsset(assetResult.data)
    setHistory(histResult.data || [])
    setAudits(auditRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleDelete = async () => {
    if (!confirm(
      `Pindahkan aset "${asset.nama_gedung}" ke Tempat Sampah?\n\nAset bisa dipulihkan kembali. Inspeksi dan kejadian sambaran yang terhubung tetap utuh.`
    )) return
    setDeleting(true)
    try {
      await client.delete(`/assets/${id}/`)
      navigate('/assets', { replace: true })
    } catch (err) {
      alert('Gagal memindah aset: ' + (err?.response?.data?.detail || err.message))
      setDeleting(false)
    }
  }

  const handleRestore = async () => {
    setRestoring(true)
    try {
      await client.post(`/assets/${id}/restore/`)
      load()
    } catch (err) {
      alert('Gagal memulihkan aset: ' + (err?.response?.data?.detail || err.message))
      setRestoring(false)
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Memuat detail aset...</div>
  if (!asset) return <div className="text-center py-12 text-gray-400">Aset tidak ditemukan</div>

  const events = history.filter((h) => h.type === 'event').map((h) => h.data)
  const inspections = history.filter((h) => h.type === 'inspection').map((h) => h.data)

  const unifiedTimeline = [
    ...history.map((item) => ({
      _type: item.type,
      _ts: item.type === 'event' ? item.data.timestamp : item.data.tgl_inspeksi,
      data: item.data,
    })),
    ...audits.map((a) => ({
      _type: 'audit',
      _ts: a.created_at,
      data: a,
    })),
  ].sort((a, b) => new Date(b._ts) - new Date(a._ts)).slice(0, 30)
  const color = getHealthStatus(asset.skor_kesehatan_aset)

  const ahiPieData = [
    { name: 'Stres Kumulatif (50%)', value: 0.5, color: '#3B82F6' },
    { name: 'Kondisi Fisik (30%)', value: 0.3, color: '#22C55E' },
    { name: 'Umur Kalender (20%)', value: 0.2, color: '#F59E0B' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn-secondary" onClick={() => navigate('/assets')}>← Kembali</button>
        <h1 className="text-xl font-bold text-gray-900 truncate flex-1 min-w-0">{asset.nama_gedung}</h1>
        {isManager && (
          <div className="flex gap-2">
            {asset.deleted_at ? (
              <button
                className="btn-primary text-sm disabled:opacity-50"
                onClick={handleRestore}
                disabled={restoring}
              >
                {restoring ? 'Memulihkan...' : '↩ Pulihkan'}
              </button>
            ) : (
              <>
                <button className="btn-secondary text-sm" onClick={() => setShowEdit(true)}>
                  Edit
                </button>
                <button
                  className="text-sm bg-red-50 hover:bg-red-100 text-red-700 px-3 py-2 rounded-lg font-medium disabled:opacity-50"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Memindah...' : 'Hapus'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {asset.deleted_at && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
          🗑️ <span>Aset ini ada di <strong>Tempat Sampah</strong> — dipindah oleh <strong>{asset.deleted_by_nama || asset.deleted_by_username || 'Manajer'}</strong> · {timeAgo(asset.deleted_at)}</span>
        </div>
      )}

      {showEdit && (
        <AssetForm
          asset={asset}
          onClose={() => setShowEdit(false)}
          onSaved={() => load()}
        />
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Asset profile */}
        <div className="card space-y-4">
          <h2 className="text-lg font-bold text-gray-800">Profil Aset</h2>
          <div className="flex items-center gap-4">
            <HealthGaugeInline score={asset.skor_kesehatan_aset} size={80} />
            <div>
              <p className="text-2xl font-bold" style={{ color: color.bg }}>
                {Math.round(asset.skor_kesehatan_aset * 100)}%
              </p>
              <p className="text-sm text-gray-500">{color.label}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-gray-400">LPL Grade</p><p className="font-semibold">{LPL_LABELS[asset.lpl_grade]}</p></div>
            <div><p className="text-gray-400">Kapasitas</p><p className="font-semibold">{asset.kapasitas_desain_ka} kA</p></div>
            <div><p className="text-gray-400">Tahun Instalasi</p><p className="font-semibold">{asset.tahun_instalasi}</p></div>
            <div><p className="text-gray-400">Material</p><p className="font-semibold">{asset.jenis_material_konduktor || '—'}</p></div>
            <div>
              <p className="text-gray-400">Resistivitas Tanah</p>
              <p className="font-semibold">
                {asset.resistivitas_tanah ? `${asset.resistivitas_tanah} Ω·m` : '—'}
                {asset.resistivitas_tanah < 10 && (
                  <span className="ml-1 text-xs text-red-500">⚠ Korosi</span>
                )}
              </p>
            </div>
            <div><p className="text-gray-400">Lokasi GPS</p><p className="font-semibold text-xs">{asset.lokasi_gps}</p></div>
          </div>
          {asset.catatan && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
              {asset.catatan}
            </div>
          )}
          <div className="flex gap-2">
            <button
              className="btn-secondary flex-1"
              onClick={() => navigate('/events/new', { state: { assetId: asset.asset_id } })}
            >
              ⚡ Catat Sambaran
            </button>
            <button
              className="btn-secondary flex-1"
              onClick={() => navigate('/inspections/new', { state: { assetId: asset.asset_id } })}
            >
              📋 Isi Logbook
            </button>
          </div>
        </div>

        {/* AHI breakdown */}
        <div className="card">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Komponen AHI</h2>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={ahiPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                {ahiPieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(val) => `${Math.round(val * 100)}%`} />
              <Legend iconSize={10} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Strike chart */}
        <div className="card">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Riwayat Sambaran</h2>
          <StrikeChart events={events} />
        </div>

        {/* Health trend */}
        <div className="card">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Tren Skor Kesehatan</h2>
          <HealthTrend inspections={inspections} />
        </div>
      </div>

      {/* Unified timeline */}
      <div className="card">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Riwayat Aktivitas</h2>
        {unifiedTimeline.length === 0 ? (
          <p className="text-gray-400 text-sm">Belum ada aktivitas</p>
        ) : (
          <div className="space-y-3">
            {unifiedTimeline.map((item, i) => {
              if (item._type === 'event') {
                const ev = item.data
                return (
                  <div key={`ev-${ev.event_id ?? i}`} className="flex gap-3 items-start">
                    <div className="mt-1 w-2 h-2 rounded-full flex-shrink-0 bg-amber-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        Sambaran {ev.estimasi_arus_puncak_ka} kA
                        {ev.fuzzy_output_label && (
                          <span className="ml-2">
                            <UrgencyBadge label={ev.fuzzy_output_label} size="sm" />
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">{formatDateTime(ev.timestamp)}</p>
                    </div>
                    <span className="text-xs text-gray-300">⚡</span>
                  </div>
                )
              }
              if (item._type === 'inspection') {
                const log = item.data
                const { canEdit, canAmend } = inspectionEligibility(log, user?.id, isManager)
                return (
                  <div key={`ins-${log.log_id ?? i}`} className="flex gap-3 items-start">
                    <div className="mt-1 w-2 h-2 rounded-full flex-shrink-0 bg-blue-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                        {log.amends && <span className="text-xs text-amber-700">↳</span>}
                        <span className="flex items-center gap-1 flex-wrap">
                          <StatusChip label="AT" value={log.status_air_terminal} />
                          <StatusChip label="DC" value={log.status_down_conductor} />
                          <StatusChip label="GD" value={log.status_grounding} />
                        </span>
                        {log.amends && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Amandemen</span>
                        )}
                        {!log.amends && log.amendments && log.amendments.length > 0 && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                            Diamandemen ({log.amendments.length})
                          </span>
                        )}
                        {log.photos && log.photos.length > 0 && (
                          <span className="text-xs text-gray-500">📷 {log.photos.length}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDateTime(log.tgl_inspeksi)}
                        {log.user_nama && <> · {log.user_nama}</>}
                      </p>
                      {(canEdit || canAmend) && (
                        <div className="flex gap-3 mt-1">
                          {canEdit && (
                            <button
                              className="text-xs text-blue-600 hover:underline"
                              onClick={() => navigate(`/inspections/new?edit=${log.log_id}`)}
                            >
                              Edit
                            </button>
                          )}
                          {canAmend && (
                            <button
                              className="text-xs text-amber-700 hover:underline"
                              onClick={() => navigate(`/inspections/new?amend=${log.log_id}`)}
                            >
                              Amandemen
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-300">📋</span>
                  </div>
                )
              }
              // audit entry
              const a = item.data
              return (
                <div key={`aud-${a.audit_id ?? i}`} className="flex gap-3 items-start">
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${AUDIT_DOT[a.action] || 'bg-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium text-gray-800">{a.actor_nama || a.actor_username || 'Sistem'}</span>{' '}
                      <span className="text-gray-600">{AUDIT_LABEL[a.action] || a.action}</span>
                      {a.note && <span className="text-gray-500"> — {a.note}</span>}
                    </p>
                    {a.diff && <CollapsibleDiff diff={a.diff} />}
                    <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(a.created_at)}</p>
                  </div>
                  <span className="text-xs text-gray-300">🔧</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

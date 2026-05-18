import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts'
import StrikeChart from '../components/StrikeChart'
import HealthTrend from '../components/HealthTrend'
import { HealthGaugeInline } from '../components/HealthGauge'
import { UrgencyBadge } from '../components/StatusBadge'
import AssetForm from '../components/AssetForm'
import FuzzyVisualizer from '../components/FuzzyVisualizer'
import { LPL_LABELS, URGENCY_ACTIONS, formatDate, formatDateTime, getHealthStatus, timeAgo } from '../utils/constants'
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

function IUIExplainer({ asset, latestEvent }) {
  const [open, setOpen] = useState(false)
  const initialR = latestEvent?.rasio_stres ?? 0.5
  const initialD = 1 - (asset?.skor_kesehatan_aset ?? 0.7)
  const [rStress, setRStress] = useState(initialR)
  const [dAsset, setDAsset] = useState(initialD)
  const [simResult, setSimResult] = useState(null)
  const [simLoading, setSimLoading] = useState(false)

  const runSimulation = async () => {
    setSimLoading(true)
    try {
      const res = await client.get(`/fuzzy/simulate/?r_stress=${rStress}&d_asset=${dAsset}`)
      setSimResult(res.data)
    } catch {
      const { localFuzzyApprox } = await import('../offline/fuzzyLookupTable')
      const local = localFuzzyApprox(rStress * 100, asset?.lpl_grade || 'III', 1 - dAsset)
      setSimResult({ score: local.score, label: local.label, provisional: true })
    } finally {
      setSimLoading(false)
    }
  }

  const RULES = [
    ['D_asset = Prima', 'Rutin', 'Rutin', 'Prioritas'],
    ['D_asset = Degradasi', 'Rutin', 'Prioritas', 'Darurat'],
    ['D_asset = Kritis', 'Prioritas', 'Darurat', 'Darurat'],
  ]

  return (
    <div className="card">
      <button
        type="button"
        className="w-full flex items-center justify-between text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <h2 className="text-lg font-bold text-gray-800">🔍 Lihat cara perhitungan IUI</h2>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-5 border-t pt-4">
          <p className="text-xs text-gray-500">
            Nilai di panel ini adalah simulasi — hasil resmi dihitung otomatis saat sambaran direkam.
          </p>

          <FuzzyVisualizer rStress={rStress} dAsset={dAsset} iuiScore={simResult?.score} />

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <label className="text-gray-600">R_stress (Rasio Stres)</label>
                <span className="font-semibold">{rStress.toFixed(2)}</span>
              </div>
              <input
                type="range" min={0} max={1.5} step={0.01}
                value={rStress}
                onChange={(e) => setRStress(parseFloat(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>0 (tanpa stres)</span><span>0.65 (batas)</span><span>1.5 (ekstrem)</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <label className="text-gray-600">D_asset (Degradasi Aset)</label>
                <span className="font-semibold">{dAsset.toFixed(2)}</span>
              </div>
              <input
                type="range" min={0} max={1} step={0.01}
                value={dAsset}
                onChange={(e) => setDAsset(parseFloat(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>0 (prima)</span><span>0.4 (degradasi)</span><span>1.0 (kritis)</span>
              </div>
            </div>
          </div>

          <button className="btn-primary" onClick={runSimulation} disabled={simLoading}>
            {simLoading ? 'Menghitung...' : 'Jalankan Inferensi Fuzzy'}
          </button>

          {simResult && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Hasil IUI</span>
                <UrgencyBadge label={simResult.label} size="lg" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Skor</span>
                <span className="text-3xl font-bold">{simResult.score?.toFixed(1)}</span>
              </div>
              <div className="border-t pt-3 text-sm text-gray-600">
                {URGENCY_ACTIONS[simResult.label]}
              </div>
              {simResult.provisional && (
                <p className="text-xs text-amber-600">Estimasi lokal (offline)</p>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Matriks Aturan Fuzzy (3×3)</h3>
            <table className="w-full text-sm text-center border-collapse">
              <thead>
                <tr>
                  <th className="border border-gray-200 px-3 py-2 bg-gray-50"></th>
                  <th className="border border-gray-200 px-3 py-2 bg-gray-50">R_stress = Rendah</th>
                  <th className="border border-gray-200 px-3 py-2 bg-gray-50">R_stress = Sedang</th>
                  <th className="border border-gray-200 px-3 py-2 bg-gray-50">R_stress = Tinggi</th>
                </tr>
              </thead>
              <tbody>
                {RULES.map(([row, ...cells]) => (
                  <tr key={row}>
                    <td className="border border-gray-200 px-3 py-2 font-medium bg-gray-50">{row}</td>
                    {cells.map((cell, i) => {
                      const cls = cell === 'Rutin'
                        ? 'bg-green-50 text-green-700'
                        : cell === 'Prioritas'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-red-50 text-red-700'
                      return (
                        <td key={i} className={`border border-gray-200 px-3 py-2 font-semibold ${cls}`}>
                          {cell}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function inspectionEligibility(log, currentUserId, isManager) {
  const isOwn = currentUserId && log.user === currentUserId
  const inGrace = log.created_at && (Date.now() - new Date(log.created_at).getTime()) < GRACE_MS
  const canEdit = (isOwn && inGrace) || isManager
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

      {/* Timeline */}
      <div className="card">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Riwayat Aktivitas</h2>
        {history.length === 0 ? (
          <p className="text-gray-400 text-sm">Belum ada aktivitas</p>
        ) : (
          <div className="space-y-3">
            {history.slice(0, 20).map((item, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${item.type === 'event' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                <div className="flex-1 min-w-0">
                  {item.type === 'event' ? (
                    <div>
                      <p className="text-sm font-medium">
                        Sambaran {item.data.estimasi_arus_puncak_ka} kA
                        {item.data.fuzzy_output_label && (
                          <span className="ml-2">
                            <UrgencyBadge label={item.data.fuzzy_output_label} size="sm" />
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">{formatDateTime(item.data.timestamp)}</p>
                    </div>
                  ) : (() => {
                    const log = item.data
                    const { canEdit, canAmend } = inspectionEligibility(log, user?.id, isManager)
                    return (
                      <div>
                        <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                          {log.amends && (
                            <span className="text-xs text-amber-700">↳</span>
                          )}
                          <span>Inspeksi — {log.status_air_terminal} / {log.status_down_conductor} / {log.status_grounding}</span>
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
                    )
                  })()}
                </div>
                <span className="text-xs text-gray-300">{item.type === 'event' ? '⚡' : '📋'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <IUIExplainer asset={asset} latestEvent={events[0]} />

      {/* Audit timeline */}
      <div className="card">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Riwayat Perubahan</h2>
        {audits.length === 0 ? (
          <p className="text-gray-400 text-sm">Belum ada perubahan tercatat.</p>
        ) : (
          <ul className="space-y-3">
            {audits.map((a) => (
              <li key={a.audit_id} className="flex gap-3 items-start">
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${AUDIT_DOT[a.action] || 'bg-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium text-gray-800">{a.actor_nama || a.actor_username || 'Sistem'}</span>{' '}
                    <span className="text-gray-600">{AUDIT_LABEL[a.action] || a.action}</span>
                    {a.note && <span className="text-gray-500"> — {a.note}</span>}
                  </p>
                  {a.diff && <DiffPreview diff={a.diff} />}
                  <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(a.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

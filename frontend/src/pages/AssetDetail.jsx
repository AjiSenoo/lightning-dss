import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'

import StrikeChart from '../components/StrikeChart'
import HealthTrend from '../components/HealthTrend'
import { HealthGaugeInline } from '../components/HealthGauge'
import { UrgencyBadge } from '../components/StatusBadge'
import AssetForm from '../components/AssetForm'
import { LPL_LABELS, formatDateTime, getHealthStatus, timeAgo } from '../utils/constants'
import cacheStore from '../offline/cacheStore'
import { removeCachedAsset } from '../offline/db'
import client from '../api/client'
import useOfflineSubmit from '../hooks/useOfflineSubmit'
import { useAuth, useIsManager } from '../auth/AuthContext'

const GRACE_MS = 5 * 60 * 1000

const AUDIT_DOT = {
  create:   'bg-green-500',
  update:   'bg-blue-500',
  delete:   'bg-red-400',
  restore:  'bg-brand-500',
  purge:    'bg-gray-400',
  replaced: 'bg-purple-500',
  replaces: 'bg-purple-400',
}

const AUDIT_LABEL = {
  create:   'menambahkan aset',
  update:   'mengedit aset',
  delete:   'memindah ke Tempat Sampah',
  restore:  'memulihkan aset',
  purge:    'menghapus permanen',
  replaced: 'mengganti aset ini dengan aset baru',
  replaces: 'menggantikan aset sebelumnya',
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

const COMPONENT_LABELS = {
  AT:  'Air Terminal',
  DC:  'Down Conductor',
  GR:  'Grounding Electrode',
  BND: 'Equipotential Bonding',
  SPD: 'Surge Protective Device',
  EQP: 'Protected Equipment',
}
const ACTION_LABELS    = { replace: 'Ganti', repair: 'Perbaiki', inspect: 'Periksa', monitor: 'Pantau', install: 'Pasang' }
const HORIZON_LABELS   = { immediate: 'Segera', within_1_month: '≤ 1 Bulan', within_6_months: '≤ 6 Bulan', next_cycle: 'Siklus Berikutnya' }
const DRIVER_LABELS    = { stress: 'Stres Kumulatif', physical: 'Kondisi Fisik', age: 'Umur Kalender', corrosion: 'Korosi Tanah' }
const MAINT_ACTIONS    = ['install', 'repair', 'replace']

const BAND_INFO = {
  hijau:  { bar: 'bg-green-500',   badge: 'bg-green-100 text-green-800',   label: 'Baik' },
  oranye: { bar: 'bg-orange-400',  badge: 'bg-orange-100 text-orange-800', label: 'Waspada' },
  merah:  { bar: 'bg-red-500',     badge: 'bg-red-100 text-red-800',       label: 'Bahaya' },
  ungu:   { bar: 'bg-purple-600',  badge: 'bg-purple-100 text-purple-800', label: 'Kritis' },
}

function ahiBand(score) {
  if (score >= 0.85) return 'hijau'
  if (score >= 0.70) return 'oranye'
  if (score >= 0.50) return 'merah'
  return 'ungu'
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
  const [searchParams] = useSearchParams()
  const fromTrash = searchParams.get('deleted') === '1'
  const isManager = useIsManager()
  const { user } = useAuth()
  const { submitMaintenance, submitAssetReplace, submitAssetDelete } = useOfflineSubmit()
  const [asset, setAsset] = useState(null)
  const [history, setHistory] = useState([])
  const [audits, setAudits] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [componentMap, setComponentMap] = useState({})
  const [allComponents, setAllComponents] = useState([])
  const [maintenanceHistory, setMaintenanceHistory] = useState([])
  const [maintenanceModal, setMaintenanceModal] = useState(null)
  const [replaceModal, setReplaceModal] = useState(null)
  const [showActivityModal, setShowActivityModal] = useState(false)
  const [showComponentsModal, setShowComponentsModal] = useState(false)

  // `silent` refetches in the background (no full-page spinner remount) so a button
  // action refreshes the affected cards in place instead of blanking the whole page.
  const load = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    const [assetResult, histResult, auditRes, compsRes, maintRes] = await Promise.all([
      cacheStore.getAsset(id, { includeDeleted: fromTrash }),
      cacheStore.getAssetHistory(id),
      client.get(`/assets/${id}/audits/`).catch(() => ({ data: [] })),
      client.get(`/components/?asset=${id}&active=false`).catch(() => ({ data: [] })),
      client.get(`/maintenance-actions/?asset=${id}`).catch(() => ({ data: [] })),
    ])
    setAsset(assetResult.data)
    setHistory(histResult.data || [])
    setAudits(auditRes.data || [])
    const rawComps = Array.isArray(compsRes.data) ? compsRes.data : (compsRes.data?.results ?? [])
    setAllComponents(rawComps)
    const map = {}
    rawComps.filter((c) => !c.end_date).forEach((c) => { map[c.component_type] = c.component_id })
    setComponentMap(map)
    const rawMaint = Array.isArray(maintRes.data) ? maintRes.data : (maintRes.data?.results ?? [])
    setMaintenanceHistory(rawMaint)
    if (silent) setRefreshing(false)
    else setLoading(false)
  }

  const refresh = () => load({ silent: true })

  const flashToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Re-sync when the offline queue drains so an open detail page isn't left stale.
  useEffect(() => {
    const onSync = () => refresh()
    window.addEventListener('sync:done', onSync)
    return () => window.removeEventListener('sync:done', onSync)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fromTrash])

  const handleDelete = async () => {
    if (!confirm(
      `Pindahkan aset "${asset.nama_gedung}" ke Tempat Sampah?\n\nAset bisa dipulihkan kembali. Inspeksi dan kejadian sambaran yang terhubung tetap utuh.`
    )) return
    setDeleting(true)
    try {
      const { queued } = await submitAssetDelete(id)
      await removeCachedAsset(id)   // drop the ghost from IndexedDB immediately
      if (queued) flashToast('Penghapusan diantrekan — akan disinkronkan saat online.')
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
      // Now active again — drop the trash flag so the reload fetches the live record.
      navigate(`/assets/${id}`, { replace: true })
      await refresh()
    } catch (err) {
      alert('Gagal memulihkan aset: ' + (err?.response?.data?.detail || err.message))
    } finally {
      setRestoring(false)
    }
  }

  const ACTION_VERB = { replace: 'Penggantian', repair: 'Perbaikan', inspect: 'Inspeksi', monitor: 'Pemantauan', install: 'Pemasangan' }

  const handleCreateMaintenance = async () => {
    const m = maintenanceModal
    setMaintenanceModal((prev) => ({ ...prev, saving: true }))
    try {
      const { queued } = await submitMaintenance({
        asset: id,
        component: m.compId,
        action: m.action,
        performed_at: m.performed_at
          ? new Date(m.performed_at).toISOString()
          : new Date().toISOString(),
        notes: m.notes || '',
      })
      setMaintenanceModal(null)
      if (queued) {
        flashToast(`${ACTION_VERB[m.action] || 'Aksi'} diantrekan — akan disinkronkan saat online.`)
      } else {
        await refresh()
        // A 'repair' records the action but (honestly) does not reset the strike/age-driven
        // AHI, so confirm explicitly that it registered rather than looking like a dead button.
        flashToast(`${ACTION_VERB[m.action] || 'Aksi'} tercatat.`)
      }
    } catch (err) {
      alert('Gagal menyimpan: ' + (err?.response?.data?.detail || JSON.stringify(err?.response?.data) || err.message))
      setMaintenanceModal((prev) => ({ ...prev, saving: false }))
    }
  }

  const handleReplace = async () => {
    const m = replaceModal
    if (!m.catatan_penggantian?.trim()) return
    setReplaceModal((prev) => ({ ...prev, saving: true }))
    try {
      const { queued, data } = await submitAssetReplace(id, {
        tanggal_instalasi: m.tanggal_instalasi,
        catatan_penggantian: m.catatan_penggantian,
      })
      await removeCachedAsset(id)   // old asset becomes soft-deleted; drop the ghost
      setReplaceModal(null)
      if (queued || !data?.asset_id) {
        flashToast('Penggantian diantrekan — akan disinkronkan saat online.')
        navigate('/assets', { replace: true })
      } else {
        navigate(`/assets/${data.asset_id}`, { replace: true })
      }
    } catch (err) {
      alert('Gagal mengganti aset: ' + (err?.response?.data?.detail || JSON.stringify(err?.response?.data) || err.message))
      setReplaceModal((prev) => ({ ...prev, saving: false }))
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
  ].sort((a, b) => new Date(b._ts) - new Date(a._ts))
  const color = getHealthStatus(asset.skor_kesehatan_aset)

  const ahi = asset.ahi_breakdown ?? null

  const hasMoreActions = ['AT', 'DC', 'GR', 'BND', 'SPD'].some(
    (ct) => maintenanceHistory.filter((a) => a.component_type === ct).length > 5
  )

  const renderTimelineItem = (item, i) => {
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
                <StatusChip label="AT"  value={log.status_air_terminal} />
                <StatusChip label="DC"  value={log.status_down_conductor} />
                <StatusChip label="GD"  value={log.status_grounding} />
                {log.status_bonding && <StatusChip label="BND" value={log.status_bonding} />}
                {log.status_spd     && <StatusChip label="SPD" value={log.status_spd} />}
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
  }

  const renderComponentSection = (ct, limitActions) => {
    const comps      = allComponents.filter((c) => c.component_type === ct)
    const actions    = maintenanceHistory.filter((a) => a.component_type === ct)
    const ctLabel    = COMPONENT_LABELS[ct]
    const activeComp = comps.find((c) => !c.end_date)
    if (comps.length === 0 && actions.length === 0) return null
    const sortedActions = actions.slice().sort((a, b) => new Date(b.performed_at) - new Date(a.performed_at))
    const visibleActions = limitActions ? sortedActions.slice(0, limitActions) : sortedActions
    return (
      <div key={ct} className="rounded-xl border border-gray-100 p-3 space-y-3">
        <p className="font-semibold text-sm text-gray-800 flex items-center gap-2">
          {ctLabel}
          {activeComp?.age_label && (
            <span className="text-xs font-normal text-gray-400">{activeComp.age_label}</span>
          )}
        </p>
        {comps.length > 0 && (
          <div className="space-y-1">
            {comps
              .slice()
              .sort((a, b) => new Date(b.install_date) - new Date(a.install_date))
              .map((c) => (
                <div key={c.component_id} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.end_date ? 'bg-gray-300' : 'bg-green-500'}`} />
                  <span>
                    Dipasang {c.install_date}
                    {c.age_label && <span className="text-gray-400"> · {c.age_label}</span>}
                    {c.end_date && <span className="text-gray-400"> → diganti {c.end_date}</span>}
                  </span>
                  {!c.end_date && (
                    <span className="ml-1 bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full text-[10px] font-medium">Aktif</span>
                  )}
                </div>
              ))}
          </div>
        )}
        {actions.length > 0 ? (
          <div className="space-y-1 border-t border-gray-50 pt-2">
            {visibleActions.map((a) => (
              <div key={a.action_id} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  a.action === 'replace' ? 'bg-purple-500' : a.action === 'repair' ? 'bg-orange-400' : 'bg-blue-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-700">{ACTION_LABELS[a.action]}</span>
                  {a.performed_by_nama && <span className="text-gray-400"> · {a.performed_by_nama}</span>}
                  {a.notes && <p className="text-gray-400 truncate">{a.notes}</p>}
                </div>
                <span className="text-gray-300 shrink-0">{formatDateTime(a.performed_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 border-t border-gray-50 pt-2">Belum ada aksi pemeliharaan</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg animate-fade-in-up">
          ✓ {toast}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn-secondary" onClick={() => navigate('/assets')}>← Kembali</button>
        <h1 className="text-xl font-bold text-gray-900 truncate flex-1 min-w-0">{asset.nama_gedung}</h1>
        {refreshing && <span className="text-xs text-gray-400 animate-pulse">menyegarkan…</span>}
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
                  className="text-sm bg-purple-50 hover:bg-purple-100 text-purple-700 px-3 py-2 rounded-lg font-medium"
                  onClick={() => setReplaceModal({
                    tanggal_instalasi: new Date().toISOString().slice(0, 10),
                    catatan_penggantian: '',
                  })}
                >
                  Ganti Aset
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

      {asset.recommendations?.incidental && !asset.deleted_at && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-800 flex items-center gap-2">
          ⚡ <span><strong>Inspeksi insidental</strong> — sambaran <strong>besar</strong> terbaru memicu inspeksi event-driven (≤ 1 bulan), di luar siklus periodik.</span>
        </div>
      )}

      {showEdit && (
        <AssetForm
          asset={asset}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); refresh(); flashToast('Aset diperbarui.') }}
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

        {/* AHI breakdown — per component */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-gray-800">Kondisi Komponen LPS</h2>
            {ahi?.worst_component && (
              <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${BAND_INFO[ahiBand(ahi.per_component[ahi.worst_component]?.ahi ?? 1)].badge}`}>
                ↓ {COMPONENT_LABELS[ahi.worst_component]}
              </span>
            )}
          </div>

          {ahi && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-500 whitespace-nowrap text-xs">Keseluruhan</span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-1.5 rounded-full ${BAND_INFO[ahiBand(ahi.ahi_overall)].bar}`}
                  style={{ width: `${Math.round(ahi.ahi_overall * 100)}%` }}
                />
              </div>
              <span className="font-bold text-sm w-9 text-right">{Math.round(ahi.ahi_overall * 100)}%</span>
            </div>
          )}

          {ahi ? (
            <div className="space-y-3 pt-1">
              {['AT', 'DC', 'GR', 'BND', 'SPD'].map((ct) => {
                const comp       = ahi.per_component?.[ct]
                const rec        = asset.recommendations?.per_component?.find((r) => r.component_type === ct)
                if (!comp) return null
                const band       = ahiBand(comp.ahi)
                const info       = BAND_INFO[band]
                const compId     = componentMap[ct]
                const activeComp = allComponents.find((c) => c.component_type === ct && !c.end_date)
                const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
                return (
                  <div key={ct} className="rounded-xl border border-gray-100 p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-800">{COMPONENT_LABELS[ct]}</span>
                      {activeComp?.age_label && (
                        <span className="text-xs font-normal text-gray-400">{activeComp.age_label}</span>
                      )}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${info.badge}`}>{info.label}</span>
                      <span className="ml-auto text-sm font-bold text-gray-700">{Math.round(comp.ahi * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${info.bar}`}
                        style={{ width: `${Math.round(comp.ahi * 100)}%` }}
                      />
                    </div>
                    <div className="flex gap-3 text-xs text-gray-400">
                      <span>Stres {Math.round((comp.sub_scores?.stress ?? 1) * 100)}%</span>
                      <span>Fisik {Math.round((comp.sub_scores?.physical ?? 1) * 100)}%</span>
                      <span>Umur {Math.round((comp.sub_scores?.age ?? 1) * 100)}%</span>
                      {comp.corrosion_applied && <span className="text-red-500 font-medium">⚠ Korosi</span>}
                    </div>
                    {(() => {
                      const lastMaint = maintenanceHistory
                        .filter((a) => (a.component === compId) || (a.component_type === ct))
                        .sort((a, b) => new Date(b.performed_at) - new Date(a.performed_at))[0]
                      const defaultAction = rec && rec.action !== 'monitor' && rec.action !== 'inspect' ? rec.action : 'repair'
                      return (
                        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-50">
                          {rec ? (
                            <>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${info.badge}`}>
                                {ACTION_LABELS[rec.action]}
                              </span>
                              <span className="text-xs text-gray-500">{HORIZON_LABELS[rec.time_horizon]}</span>
                              <span className="text-xs text-gray-400">· {DRIVER_LABELS[rec.primary_driver]}</span>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400">Kondisi baik — pantau</span>
                          )}
                          {lastMaint && (
                            <span className="text-xs text-gray-400" title="Pemeliharaan terakhir">
                              🛠 {ACTION_LABELS[lastMaint.action] || lastMaint.action} · {formatDateTime(lastMaint.performed_at)}
                            </span>
                          )}
                          {compId && !asset.deleted_at && (
                            <button
                              className="ml-auto text-xs text-brand-700 hover:underline font-medium"
                              onClick={() => setMaintenanceModal({
                                ct,
                                compId,
                                action: defaultAction,
                                performed_at: nowLocal,
                                notes: '',
                              })}
                            >
                              + Aksi Pemeliharaan
                            </button>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
              {/* EQP — terminal sink marker */}
              {ahi?.per_component?.EQP !== undefined && (
                <div className="rounded-xl border border-dashed border-gray-200 p-3 flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-400">Protected Equipment</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">Ujung Rantai</span>
                  <span className="ml-auto text-xs text-gray-400">Titik akhir proteksi</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Data AHI belum tersedia</p>
          )}
        </div>

        {/* Strike chart */}
        <div className="card">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Riwayat Sambaran</h2>
          <StrikeChart events={events} kapasitasKa={asset.kapasitas_desain_ka} />
        </div>

        {/* Health trend */}
        <div className="card">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Tren Skor Kesehatan</h2>
          <HealthTrend inspections={inspections} />
        </div>
      </div>

      {/* Unified timeline */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">Riwayat Aktivitas</h2>
          {unifiedTimeline.length > 5 && (
            <button
              className="text-sm text-brand-700 hover:underline font-medium"
              onClick={() => setShowActivityModal(true)}
            >
              Lihat semua ({unifiedTimeline.length})
            </button>
          )}
        </div>
        {unifiedTimeline.length === 0 ? (
          <p className="text-gray-400 text-sm">Belum ada aktivitas</p>
        ) : (
          <div className="space-y-3">
            {unifiedTimeline.slice(0, 5).map(renderTimelineItem)}
          </div>
        )}
      </div>

      {/* Component history */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">Riwayat Komponen LPS</h2>
          {hasMoreActions && (
            <button
              className="text-sm text-brand-700 hover:underline font-medium"
              onClick={() => setShowComponentsModal(true)}
            >
              Lihat semua
            </button>
          )}
        </div>
        {['AT', 'DC', 'GR', 'BND', 'SPD'].map((ct) => renderComponentSection(ct, 5))}
        {allComponents.length === 0 && maintenanceHistory.length === 0 && (
          <p className="text-sm text-gray-400">Belum ada data komponen</p>
        )}
      </div>

      {showActivityModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowActivityModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="font-bold text-gray-900">Riwayat Aktivitas</h3>
              <button className="text-gray-400 hover:text-gray-600 text-lg leading-none" onClick={() => setShowActivityModal(false)}>✕</button>
            </div>
            <div className="overflow-y-auto p-6 space-y-3">
              {unifiedTimeline.map(renderTimelineItem)}
            </div>
          </div>
        </div>
      )}

      {showComponentsModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowComponentsModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="font-bold text-gray-900">Riwayat Komponen LPS</h3>
              <button className="text-gray-400 hover:text-gray-600 text-lg leading-none" onClick={() => setShowComponentsModal(false)}>✕</button>
            </div>
            <div className="overflow-y-auto p-6 space-y-4">
              {['AT', 'DC', 'GR', 'BND', 'SPD'].map((ct) => renderComponentSection(ct, null))}
            </div>
          </div>
        </div>
      )}

      {replaceModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div>
              <h3 className="font-bold text-gray-900">Ganti Aset Lengkap</h3>
              <p className="text-xs text-gray-500 mt-1">
                Aset <strong>{asset.nama_gedung}</strong> akan diarsipkan dan digantikan aset baru dengan komponen AT, DC, GR, BND, SPD, dan EQP segar.
                Data sambaran &amp; inspeksi lama tetap melekat pada aset yang diarsipkan.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Tanggal instalasi aset baru</label>
                <input
                  type="date"
                  className="input w-full"
                  max={new Date().toISOString().slice(0, 10)}
                  value={replaceModal.tanggal_instalasi}
                  onChange={(e) => setReplaceModal((m) => ({ ...m, tanggal_instalasi: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Alasan penggantian <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="input w-full resize-none"
                  rows={3}
                  placeholder="cth. aset lama dibongkar total karena renovasi gedung"
                  value={replaceModal.catatan_penggantian}
                  onChange={(e) => setReplaceModal((m) => ({ ...m, catatan_penggantian: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setReplaceModal(null)}>
                Batal
              </button>
              <button
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                disabled={replaceModal.saving || !replaceModal.catatan_penggantian?.trim()}
                onClick={handleReplace}
              >
                {replaceModal.saving ? 'Memproses...' : 'Ganti Aset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {maintenanceModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-gray-900">Catat Aksi Pemeliharaan</h3>
            <p className="text-sm text-gray-600">
              Komponen: <span className="font-semibold">{COMPONENT_LABELS[maintenanceModal.ct]}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Jenis Aksi</label>
                <select
                  className="input w-full"
                  value={maintenanceModal.action}
                  onChange={(e) => setMaintenanceModal((m) => ({ ...m, action: e.target.value }))}
                >
                  {MAINT_ACTIONS.map((a) => (
                    <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Tanggal &amp; Waktu</label>
                <input
                  type="datetime-local"
                  className="input w-full"
                  value={maintenanceModal.performed_at}
                  onChange={(e) => setMaintenanceModal((m) => ({ ...m, performed_at: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Catatan{maintenanceModal.action === 'replace' ? <span className="text-red-500 ml-0.5">*</span> : ''}
                </label>
                <textarea
                  className="input w-full resize-none"
                  rows={3}
                  placeholder={maintenanceModal.action === 'replace' ? 'cth. ganti karena korosi parah pada terminal udara' : 'cth. kencangkan sambungan klem bawah'}
                  value={maintenanceModal.notes}
                  onChange={(e) => setMaintenanceModal((m) => ({ ...m, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setMaintenanceModal(null)}>
                Batal
              </button>
              <button
                className="btn-primary flex-1 disabled:opacity-50"
                disabled={maintenanceModal.saving || (maintenanceModal.action === 'replace' && !maintenanceModal.notes?.trim())}
                onClick={handleCreateMaintenance}
              >
                {maintenanceModal.saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

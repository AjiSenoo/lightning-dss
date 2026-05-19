import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import cacheStore from '../offline/cacheStore'
import { useAuth, useIsManager } from '../auth/AuthContext'
import { formatDateTime } from '../utils/constants'
import EmptyState from '../components/EmptyState'
import { SkeletonTable } from '../components/Skeleton'
import VerificationChip from '../components/VerificationChip'

const GRACE_MS = 5 * 60 * 1000

function StatusChip({ label, value }) {
  const ok = value === 'OK'
  return (
    <span className={`pill ring-1 ${
      ok
        ? 'bg-green-50 text-green-700 ring-green-100'
        : 'bg-red-50 text-red-700 ring-red-100'
    }`}>
      <span className={`w-1 h-1 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {label}
    </span>
  )
}

function AmendmentBadge({ log }) {
  if (log.amends) {
    return <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Amandemen</span>
  }
  if (log.amendments && log.amendments.length > 0) {
    return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Sudah diamandemen ({log.amendments.length})</span>
  }
  return null
}

export default function InspectionReport() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isManager = useIsManager()

  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrev, setHasPrev] = useState(false)
  const [count, setCount] = useState(0)

  const [assets, setAssets] = useState([])
  const [filterAsset, setFilterAsset] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [issuesOnly, setIssuesOnly] = useState(false)
  const [filterVerification, setFilterVerification] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    cacheStore.getAssets().then((r) => setAssets(r.data || []))
  }, [])

  const fetchPage = async (p = 1) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(p) })
      if (filterAsset) params.set('asset', filterAsset)
      if (filterFrom) params.set('from', filterFrom)
      if (filterTo) params.set('to', filterTo)
      if (issuesOnly) params.set('issues_only', 'true')
      if (filterVerification) params.set('verification', filterVerification)
      const res = await client.get(`/inspections/?${params.toString()}`)
      const data = res.data
      const items = Array.isArray(data) ? data : data.results || []
      setLogs(items)
      setHasNext(!!data.next)
      setHasPrev(!!data.previous)
      setCount(data.count ?? items.length)
      setPage(p)
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Gagal memuat data')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPage(1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAsset, filterFrom, filterTo, issuesOnly, filterVerification])

  const filtered = useMemo(() => {
    if (!search.trim()) return logs
    const q = search.toLowerCase()
    return logs.filter((l) =>
      (l.user_nama || '').toLowerCase().includes(q) ||
      (l.user_username || '').toLowerCase().includes(q)
    )
  }, [logs, search])

  const eligibility = (log) => {
    const isOwn = user && log.user === user.id
    const inGrace = log.created_at && (Date.now() - new Date(log.created_at).getTime()) < GRACE_MS
    const canEdit = !log.verified_at && ((isOwn && inGrace) || isManager)
    const canAmend = ((isOwn && !inGrace) || isManager) && !log.amends
    return { canEdit, canAmend }
  }

  const handleEdit = (log) => navigate(`/inspections/new?edit=${log.log_id}`)
  const handleAmend = (log) => navigate(`/inspections/new?amend=${log.log_id}`)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Riwayat Inspeksi</h1>
        <p className="text-sm text-gray-500 mt-0.5">Audit log semua inspeksi di organisasi Anda</p>
      </div>

      {/* Filters */}
      <div className="card space-y-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500">Aset</label>
            <select
              className="form-input mt-1"
              value={filterAsset}
              onChange={(e) => setFilterAsset(e.target.value)}
            >
              <option value="">Semua aset</option>
              {assets.map((a) => (
                <option key={a.asset_id} value={a.asset_id}>{a.nama_gedung}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Dari tanggal</label>
            <input
              type="date"
              className="form-input mt-1"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Sampai tanggal</label>
            <input
              type="date"
              className="form-input mt-1"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Cari Teknisi</label>
            <input
              className="form-input mt-1"
              placeholder="Nama teknisi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={issuesOnly}
                onChange={(e) => setIssuesOnly(e.target.checked)}
              />
              Hanya yang bermasalah (komponen wajib tidak OK)
            </label>
            <div>
              <select
                className="form-input text-sm"
                value={filterVerification}
                onChange={(e) => setFilterVerification(e.target.value)}
              >
                <option value="">Semua verifikasi</option>
                <option value="verified">Terverifikasi</option>
                <option value="revision_requested">Revisi Diminta</option>
                <option value="pending">Belum Diverifikasi</option>
              </select>
            </div>
          </div>
          <span className="text-xs text-gray-500">{count} log ditemukan</span>
        </div>
      </div>

      {/* Table */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📋"
          title="Belum ada inspeksi yang cocok"
          description={filterAsset || filterFrom || filterTo || issuesOnly || search
            ? "Coba ubah filter atau hapus pencarian."
            : "Inspeksi yang dilakukan teknisi akan muncul di sini."}
        />
      ) : (
        <div className="card p-0 overflow-x-auto overflow-y-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50 sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4 font-semibold">Tanggal</th>
                <th className="py-3 px-4 font-semibold">Aset</th>
                <th className="py-3 px-4 font-semibold">Dibuat oleh</th>
                <th className="py-3 px-4 font-semibold">Diedit terakhir</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Verifikasi</th>
                <th className="py-3 px-4 font-semibold">Foto</th>
                <th className="py-3 px-4 font-semibold">Catatan</th>
                <th className="py-3 px-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log, i) => {
                const { canEdit, canAmend } = eligibility(log)
                return (
                  <tr
                    key={log.log_id}
                    className={`border-b last:border-b-0 hover:bg-brand-50/40 cursor-pointer transition-colors animate-fade-in-up stagger-${(i % 5) + 1} ${
                      i % 2 === 1 ? 'bg-gray-50/40' : ''
                    }`}
                    onClick={() => navigate(`/inspections/${log.log_id}`)}
                  >
                    <td className="py-3 px-4 whitespace-nowrap text-gray-700">{formatDateTime(log.tgl_inspeksi)}</td>
                    <td className="py-3 px-4 font-medium text-gray-900">{log.asset_nama_gedung}</td>
                    <td className="py-3 px-4 text-gray-600">{log.user_nama || log.user_username || '—'}</td>
                    <td className="py-3 px-4 text-gray-500 text-xs">
                      {log.updated_by_nama && log.updated_by !== log.user
                        ? <><span className="font-medium text-gray-700">{log.updated_by_nama}</span><br />{formatDateTime(log.updated_at)}</>
                        : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        <StatusChip label="AT" value={log.status_air_terminal} />
                        <StatusChip label="DC" value={log.status_down_conductor} />
                        <StatusChip label="GD" value={log.status_grounding} />
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <VerificationChip status={log.verification_status} />
                    </td>
                    <td className="py-3 px-4 text-gray-600">{log.photos?.length ? `📷 ${log.photos.length}` : '—'}</td>
                    <td className="py-3 px-4"><AmendmentBadge log={log} /></td>
                    <td className="py-3 px-4 whitespace-nowrap text-right">
                      {canEdit && (
                        <button
                          className="text-xs text-brand-700 hover:underline mr-2 font-medium"
                          onClick={(e) => { e.stopPropagation(); handleEdit(log) }}
                        >
                          Edit
                        </button>
                      )}
                      {canAmend && (
                        <button
                          className="text-xs text-amber-700 hover:underline font-medium"
                          onClick={(e) => { e.stopPropagation(); handleAmend(log) }}
                        >
                          Amandemen
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

      {/* Pagination */}
      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-between">
          <button
            className="btn-secondary text-sm disabled:opacity-50"
            onClick={() => fetchPage(page - 1)}
            disabled={!hasPrev}
          >
            ← Sebelumnya
          </button>
          <span className="text-xs text-gray-500">Halaman {page}</span>
          <button
            className="btn-secondary text-sm disabled:opacity-50"
            onClick={() => fetchPage(page + 1)}
            disabled={!hasNext}
          >
            Berikutnya →
          </button>
        </div>
      )}

    </div>
  )
}

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import cacheStore from '../offline/cacheStore'
import { formatDateTime } from '../utils/constants'
import { UrgencyBadge } from '../components/StatusBadge'
import MagnitudeBadge from '../components/MagnitudeBadge'
import EmptyState from '../components/EmptyState'
import { SkeletonTable } from '../components/Skeleton'

const URGENCY_OPTIONS = [
  { value: '', label: 'Semua urgensi' },
  { value: 'Inspeksi Rutin', label: 'Inspeksi Rutin' },
  { value: 'Inspeksi Prioritas', label: 'Inspeksi Prioritas' },
  { value: 'Inspeksi Darurat', label: 'Inspeksi Darurat' },
]

export default function EventLog() {
  const navigate = useNavigate()

  const [events, setEvents] = useState([])
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
  const [filterUrgency, setFilterUrgency] = useState('')
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
      if (filterUrgency) params.set('urgency', filterUrgency)
      const res = await client.get(`/events/?${params.toString()}`)
      const data = res.data
      const items = Array.isArray(data) ? data : data.results || []
      setEvents(items)
      setHasNext(!!data.next)
      setHasPrev(!!data.previous)
      setCount(data.count ?? items.length)
      setPage(p)
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Gagal memuat data')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPage(1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAsset, filterFrom, filterTo, filterUrgency])

  const filtered = useMemo(() => {
    if (!search.trim()) return events
    const q = search.toLowerCase()
    return events.filter((e) =>
      (e.catatan || '').toLowerCase().includes(q) ||
      (e.asset_nama_gedung || '').toLowerCase().includes(q) ||
      (e.created_by_nama || '').toLowerCase().includes(q) ||
      (e.created_by_username || '').toLowerCase().includes(q)
    )
  }, [events, search])

  const hasFilters = filterAsset || filterFrom || filterTo || filterUrgency || search.trim()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Riwayat Sambaran</h1>
        <p className="text-sm text-gray-500 mt-0.5">Log semua sambaran petir di organisasi Anda</p>
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
            <label className="text-xs text-gray-500">Urgensi</label>
            <select
              className="form-input mt-1"
              value={filterUrgency}
              onChange={(e) => setFilterUrgency(e.target.value)}
            >
              {URGENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Cari</label>
            <input
              className="form-input text-sm"
              placeholder="Catatan, aset, atau teknisi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-xs text-gray-500 self-end">{count} sambaran ditemukan</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🌩️"
          title="Belum ada data sambaran"
          description={hasFilters
            ? 'Tidak ada sambaran yang cocok dengan filter saat ini. Coba ubah atau hapus filter.'
            : 'Sambaran petir yang dicatat teknisi akan muncul di sini.'}
        />
      ) : (
        <div className="card p-0 overflow-x-auto overflow-y-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50 sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4 font-semibold">Tanggal</th>
                <th className="py-3 px-4 font-semibold">Aset</th>
                <th className="py-3 px-4 font-semibold">Arus puncak</th>
                <th className="py-3 px-4 font-semibold">Rasio stres</th>
                <th className="py-3 px-4 font-semibold">Urgensi</th>
                <th className="py-3 px-4 font-semibold">Catatan</th>
                <th className="py-3 px-4 font-semibold">Dibuat oleh</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr
                  key={e.event_id}
                  className={`border-b last:border-b-0 hover:bg-brand-50/40 cursor-pointer transition-colors animate-fade-in-up stagger-${(i % 5) + 1} ${
                    i % 2 === 1 ? 'bg-gray-50/40' : ''
                  }`}
                  onClick={() => navigate(`/assets/${e.asset}`)}
                >
                  <td className="py-3 px-4 whitespace-nowrap text-gray-700">{formatDateTime(e.timestamp)}</td>
                  <td className="py-3 px-4 font-medium text-gray-900">{e.asset_nama_gedung}</td>
                  <td className="py-3 px-4 text-gray-700">
                    <div className="flex items-center gap-2">
                      <span>{e.estimasi_arus_puncak_ka != null ? `${e.estimasi_arus_puncak_ka} kA` : '—'}</span>
                      {e.estimasi_arus_puncak_ka != null && <MagnitudeBadge ipeak={e.estimasi_arus_puncak_ka} />}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-700">
                    {e.rasio_stres != null ? e.rasio_stres.toFixed(2) : '—'}
                  </td>
                  <td className="py-3 px-4">
                    {e.fuzzy_output_label
                      ? <UrgencyBadge label={e.fuzzy_output_label} size="sm" />
                      : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="py-3 px-4 max-w-xs">
                    <span className="truncate block text-gray-600" title={e.catatan || ''}>
                      {e.catatan || '—'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {e.created_by_nama || e.created_by_username || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

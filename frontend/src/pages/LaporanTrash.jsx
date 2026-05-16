import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import { formatDateTime } from '../utils/constants'
import EmptyState from '../components/EmptyState'
import { SkeletonTable } from '../components/Skeleton'

export default function LaporanTrash() {
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrev, setHasPrev] = useState(false)
  const [count, setCount] = useState(0)
  const [restoring, setRestoring] = useState(null)

  const fetchPage = async (p = 1) => {
    setLoading(true)
    setError('')
    try {
      const res = await client.get(`/inspections/trash/?page=${p}`)
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

  useEffect(() => { fetchPage(1) }, [])

  const handleRestore = async (log) => {
    setRestoring(log.log_id)
    try {
      await client.post(`/inspections/${log.log_id}/restore/`)
      setLogs((prev) => prev.filter((l) => l.log_id !== log.log_id))
      setCount((c) => c - 1)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Gagal memulihkan laporan')
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tempat Sampah</h1>
        <p className="text-sm text-gray-500 mt-0.5">Laporan yang dihapus — dapat dipulihkan dalam 49 hari (7 minggu)</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
        Laporan di sini akan <strong>dihapus permanen</strong> setelah 49 hari sejak tanggal penghapusan.
        Gunakan tombol <strong>Pulihkan</strong> untuk mengembalikan laporan ke daftar aktif.
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={5} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon="🗑️"
          title="Tempat Sampah kosong"
          description="Tidak ada laporan yang baru dihapus."
          action={
            <button className="btn-secondary" onClick={() => navigate('/inspections')}>
              Kembali ke daftar
            </button>
          }
        />
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="py-3 px-4 font-semibold">Tanggal Inspeksi</th>
                <th className="py-3 px-4 font-semibold">Aset</th>
                <th className="py-3 px-4 font-semibold">Dibuat oleh</th>
                <th className="py-3 px-4 font-semibold">Dihapus oleh</th>
                <th className="py-3 px-4 font-semibold">Dihapus pada</th>
                <th className="py-3 px-4 font-semibold">Hapus permanen</th>
                <th className="py-3 px-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr
                  key={log.log_id}
                  className={`border-b last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}
                  onClick={() => navigate(`/inspections/${log.log_id}`)}
                >
                  <td className="py-3 px-4 text-gray-700 whitespace-nowrap">{formatDateTime(log.tgl_inspeksi)}</td>
                  <td className="py-3 px-4 font-medium text-gray-900">{log.asset_nama_gedung}</td>
                  <td className="py-3 px-4 text-gray-600">{log.user_nama || log.user_username || '—'}</td>
                  <td className="py-3 px-4 text-gray-600">{log.deleted_by_nama || '—'}</td>
                  <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{formatDateTime(log.deleted_at)}</td>
                  <td className="py-3 px-4 text-red-600 font-medium whitespace-nowrap">
                    {log.purge_at ? formatDateTime(log.purge_at) : '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      className="text-xs text-brand-700 hover:underline font-medium disabled:opacity-50"
                      disabled={restoring === log.log_id}
                      onClick={(e) => { e.stopPropagation(); handleRestore(log) }}
                    >
                      {restoring === log.log_id ? 'Memulihkan…' : 'Pulihkan'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-between">
          <button className="btn-secondary text-sm disabled:opacity-50" onClick={() => fetchPage(page - 1)} disabled={!hasPrev}>
            ← Sebelumnya
          </button>
          <span className="text-xs text-gray-500">Halaman {page} · {count} laporan</span>
          <button className="btn-secondary text-sm disabled:opacity-50" onClick={() => fetchPage(page + 1)} disabled={!hasNext}>
            Berikutnya →
          </button>
        </div>
      )}
    </div>
  )
}

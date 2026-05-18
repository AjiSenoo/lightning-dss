import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import { formatDateTime, LPL_LABELS } from '../utils/constants'
import EmptyState from '../components/EmptyState'
import { SkeletonTable } from '../components/Skeleton'

export default function AssetTrash() {
  const navigate = useNavigate()
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [restoring, setRestoring] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await client.get('/assets/trash/')
      const data = res.data
      setAssets(Array.isArray(data) ? data : data.results || [])
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Gagal memuat data')
      setAssets([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleRestore = async (asset) => {
    setRestoring(asset.asset_id)
    try {
      await client.post(`/assets/${asset.asset_id}/restore/`)
      setAssets((prev) => prev.filter((a) => a.asset_id !== asset.asset_id))
    } catch (err) {
      setError(err?.response?.data?.detail || 'Gagal memulihkan aset')
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn-secondary" onClick={() => navigate('/assets')}>← Portofolio Aset</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tempat Sampah Aset</h1>
          <p className="text-sm text-gray-500 mt-0.5">Aset yang dipindahkan dapat dipulihkan kapan saja</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
        Aset di sini <strong>tidak akan dihapus permanen secara otomatis</strong>. Data historis (inspeksi &amp; sambaran) tetap utuh.
        Gunakan tombol <strong>Pulihkan</strong> untuk mengembalikan aset ke daftar aktif.
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={4} />
      ) : assets.length === 0 ? (
        <EmptyState
          icon="🗑️"
          title="Tempat Sampah Aset kosong"
          description="Semua aset masih aktif."
          action={
            <button className="btn-secondary" onClick={() => navigate('/assets')}>
              Kembali ke Portofolio
            </button>
          }
        />
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="py-3 px-4 font-semibold">Nama Gedung</th>
                <th className="py-3 px-4 font-semibold">LPL</th>
                <th className="py-3 px-4 font-semibold">Dipindah oleh</th>
                <th className="py-3 px-4 font-semibold">Dipindah pada</th>
                <th className="py-3 px-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset, i) => (
                <tr
                  key={asset.asset_id}
                  className={`border-b last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}
                  onClick={() => navigate(`/assets/${asset.asset_id}`)}
                >
                  <td className="py-3 px-4 font-medium text-gray-900">{asset.nama_gedung}</td>
                  <td className="py-3 px-4 text-gray-600">
                    <span className="pill bg-brand-50 text-brand-700">LPL {asset.lpl_grade}</span>
                    <span className="ml-1 text-xs text-gray-400">{LPL_LABELS[asset.lpl_grade]}</span>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{asset.deleted_by_nama || asset.deleted_by_username || '—'}</td>
                  <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{formatDateTime(asset.deleted_at)}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      className="text-xs text-brand-700 hover:underline font-medium disabled:opacity-50"
                      disabled={restoring === asset.asset_id}
                      onClick={(e) => { e.stopPropagation(); handleRestore(asset) }}
                    >
                      {restoring === asset.asset_id ? 'Memulihkan…' : 'Pulihkan'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getHealthStatus, LPL_LABELS, formatDate } from '../utils/constants'
import cacheStore from '../offline/cacheStore'

export default function AssetPortfolio() {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLpl, setFilterLpl] = useState('')
  const [isStale, setIsStale] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      setLoading(true)
      const result = await cacheStore.getAssets()
      setAssets(result.data || [])
      setIsStale(result.isStale)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = assets.filter((a) => {
    const matchSearch = !search || a.nama_gedung.toLowerCase().includes(search.toLowerCase())
    const matchLpl = !filterLpl || a.lpl_grade === filterLpl
    return matchSearch && matchLpl
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Portofolio Aset</h1>
        {isStale && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
            Data tersimpan (offline)
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          className="form-input max-w-xs"
          placeholder="Cari nama gedung..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="form-input max-w-[160px]"
          value={filterLpl}
          onChange={(e) => setFilterLpl(e.target.value)}
        >
          <option value="">Semua LPL</option>
          {['I', 'II', 'III', 'IV'].map((lpl) => (
            <option key={lpl} value={lpl}>LPL {lpl}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Memuat aset...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Belum ada data aset</div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((asset) => {
            const color = getHealthStatus(asset.skor_kesehatan_aset)
            const pct = Math.round((asset.skor_kesehatan_aset ?? 0) * 100)
            return (
              <div
                key={asset.asset_id}
                className="card hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/assets/${asset.asset_id}`)}
              >
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{asset.nama_gedung}</p>
                    <p className="text-sm text-gray-500">{LPL_LABELS[asset.lpl_grade]}</p>
                  </div>
                  {/* Health bar */}
                  <div className="w-32">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">Kesehatan</span>
                      <span className="font-semibold" style={{ color: color.bg }}>{pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: color.bg }}
                      />
                    </div>
                  </div>
                  <div className="text-right hidden md:block">
                    <p className="text-xs text-gray-400">Sambaran terakhir</p>
                    <p className="text-sm">{formatDate(asset.latest_event?.timestamp)}</p>
                    <p className="text-xs text-gray-400 mt-1">Inspeksi terakhir</p>
                    <p className="text-sm">{formatDate(asset.latest_inspection_date)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-secondary text-sm"
                      onClick={(e) => { e.stopPropagation(); navigate('/events/new', { state: { assetId: asset.asset_id } }) }}
                    >
                      ⚡ Sambaran
                    </button>
                    <button
                      className="btn-secondary text-sm"
                      onClick={(e) => { e.stopPropagation(); navigate('/inspections/new', { state: { assetId: asset.asset_id } }) }}
                    >
                      📋 Logbook
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

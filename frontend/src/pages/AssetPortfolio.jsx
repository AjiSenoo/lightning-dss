import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LPL_LABELS, formatDate, HEALTH_BAND_HEX, HEALTH_BAND_LABEL, scoreToBand } from '../utils/constants'
import cacheStore from '../offline/cacheStore'
import { useIsManager } from '../auth/AuthContext'
import AssetForm from '../components/AssetForm'
import EmptyState from '../components/EmptyState'
import { SkeletonCard } from '../components/Skeleton'
import AssetMap from '../components/AssetMap'

export default function AssetPortfolio() {
  const [assets, setAssets] = useState([])
  const [mapAssets, setMapAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLpl, setFilterLpl] = useState('')
  const [isStale, setIsStale] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const navigate = useNavigate()
  const isManager = useIsManager()

  const reload = async () => {
    setLoading(true)
    const [result, mapResult] = await Promise.all([
      cacheStore.getAssets(),
      cacheStore.getDashboardMap(),
    ])
    setAssets(result.data || [])
    setMapAssets(mapResult.data || [])
    setIsStale(result.isStale || mapResult.isStale)
    setLoading(false)
  }

  useEffect(() => {
    reload()
    const onSync = () => reload()
    window.addEventListener('sync:done', onSync)
    return () => window.removeEventListener('sync:done', onSync)
  }, [])

  const filtered = assets.filter((a) => {
    const matchSearch = !search || a.nama_gedung.toLowerCase().includes(search.toLowerCase())
    const matchLpl = !filterLpl || a.lpl_grade === filterLpl
    return matchSearch && matchLpl
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portofolio Aset</h1>
          <p className="text-sm text-gray-500 mt-0.5">Daftar aset proteksi petir di organisasi Anda</p>
        </div>
        <div className="flex items-center gap-2">
          {isStale && (
            <span className="pill bg-amber-50 text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Offline
            </span>
          )}
          {isManager && (
            <>
              <button className="btn-secondary text-sm" onClick={() => navigate('/assets/trash')}>
                🗑️ Tempat Sampah
              </button>
              <button className="btn-primary" onClick={() => setShowCreate(true)}>
                + Aset Baru
              </button>
            </>
          )}
        </div>
      </div>

      {showCreate && (
        <AssetForm
          onClose={() => setShowCreate(false)}
          onSaved={() => reload()}
        />
      )}

      {/* Map */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">🗺️ Peta Aset</h2>
          <p className="text-xs text-gray-500 mt-0.5">Klik pin untuk melihat detail aset</p>
        </div>
        <AssetMap assets={mapAssets} />
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
        <div className="grid gap-3">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🏗️"
          title="Belum ada data aset"
          description={search || filterLpl
            ? "Tidak ada aset yang cocok dengan filter saat ini."
            : "Tambahkan aset pertama untuk mulai memantau sistem proteksi petir."}
          action={isManager && !search && !filterLpl && (
            <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Tambah Aset</button>
          )}
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((asset, i) => {
            const ahiScore = asset.ahi_breakdown?.ahi_safety ?? asset.skor_kesehatan_aset
            const band     = scoreToBand(ahiScore)
            const hex      = HEALTH_BAND_HEX[band]
            const pct      = Math.round((ahiScore ?? 0) * 100)
            return (
              <div
                key={asset.asset_id}
                className={`card card-hover cursor-pointer hover:-translate-y-0.5 transition-all animate-fade-in-up stagger-${(i % 5) + 1}`}
                onClick={() => navigate(`/assets/${asset.asset_id}`)}
              >
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-gray-900 truncate">{asset.nama_gedung}</p>
                      <span className="pill bg-brand-50 text-brand-700 flex-shrink-0">
                        LPL {asset.lpl_grade}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{LPL_LABELS[asset.lpl_grade]}</p>
                  </div>

                  {/* Health bar — driven by AHI_safety */}
                  <div className="w-36">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">{HEALTH_BAND_LABEL[band]}</span>
                      <span className="font-bold" style={{ color: hex }}>{pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, ${hex}, ${hex}dd)`,
                          boxShadow: `0 0 6px ${hex}40`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="text-right hidden md:block min-w-[140px]">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Sambaran terakhir</p>
                    <p className="text-xs text-gray-700">{formatDate(asset.latest_event?.timestamp)}</p>
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mt-1">Inspeksi terakhir</p>
                    <p className="text-xs text-gray-700">{formatDate(asset.latest_inspection_date)}</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      className="btn-secondary"
                      onClick={(e) => { e.stopPropagation(); navigate('/events/new', { state: { assetId: asset.asset_id } }) }}
                    >
                      ⚡ Sambaran
                    </button>
                    <button
                      className="btn-secondary"
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

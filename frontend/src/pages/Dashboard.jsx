import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AssetMap from '../components/AssetMap'
import { formatDateTime, formatDate } from '../utils/constants'
import cacheStore from '../offline/cacheStore'

function StatCard({ title, value, icon, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    green: 'bg-green-50 text-green-700',
  }
  return (
    <div className="card flex items-center gap-4">
      <div className={`text-3xl p-3 rounded-xl ${colors[color]}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
        <p className="text-sm text-gray-500">{title}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [mapAssets, setMapAssets] = useState([])
  const [isStale, setIsStale] = useState(false)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [summaryResult, mapResult] = await Promise.all([
        cacheStore.getDashboardSummary(),
        cacheStore.getDashboardMap(),
      ])
      setSummary(summaryResult.data)
      setMapAssets(mapResult.data || [])
      setIsStale(summaryResult.isStale || mapResult.isStale)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        {isStale && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
            Data tersimpan (offline)
          </span>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Aset" value={summary?.total_assets} icon="🏗️" color="blue" />
        <StatCard title="Perlu Inspeksi" value={summary?.assets_needing_inspection} icon="⚠️" color="amber" />
        <StatCard title="Kejadian 7 Hari" value={summary?.events_last_7_days} icon="⚡" color="blue" />
        <StatCard title="Aset Kritis" value={summary?.critical_assets} icon="🚨" color="red" />
      </div>

      {/* Map */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-gray-800">Peta Aset</h2>
          <p className="text-xs text-gray-500">Klik pin untuk melihat detail aset</p>
        </div>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-gray-400">Memuat peta...</div>
        ) : (
          <AssetMap assets={mapAssets} height="400px" />
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          className="card text-left hover:shadow-lg transition-shadow border-2 border-dashed border-blue-200 hover:border-blue-400"
          onClick={() => navigate('/events/new')}
        >
          <div className="text-2xl mb-2">⚡</div>
          <p className="font-semibold text-gray-800">Catat Sambaran Petir</p>
          <p className="text-sm text-gray-500 mt-1">Rekam kejadian & dapatkan rekomendasi inspeksi</p>
        </button>
        <button
          className="card text-left hover:shadow-lg transition-shadow border-2 border-dashed border-green-200 hover:border-green-400"
          onClick={() => navigate('/inspections/new')}
        >
          <div className="text-2xl mb-2">📋</div>
          <p className="font-semibold text-gray-800">Isi Logbook Inspeksi</p>
          <p className="text-sm text-gray-500 mt-1">Laporkan kondisi komponen & perbarui skor kesehatan</p>
        </button>
      </div>
    </div>
  )
}

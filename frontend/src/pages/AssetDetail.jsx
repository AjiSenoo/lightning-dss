import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts'
import StrikeChart from '../components/StrikeChart'
import HealthTrend from '../components/HealthTrend'
import { HealthGaugeInline } from '../components/HealthGauge'
import { UrgencyBadge } from '../components/StatusBadge'
import { LPL_LABELS, formatDate, formatDateTime, getHealthStatus } from '../utils/constants'
import cacheStore from '../offline/cacheStore'

export default function AssetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [asset, setAsset] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [assetResult, histResult] = await Promise.all([
        cacheStore.getAsset(id),
        cacheStore.getAssetHistory(id),
      ])
      setAsset(assetResult.data)
      setHistory(histResult.data || [])
      setLoading(false)
    }
    load()
  }, [id])

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
      <div className="flex items-center gap-3">
        <button className="btn-secondary" onClick={() => navigate('/assets')}>← Kembali</button>
        <h1 className="text-xl font-bold text-gray-900 truncate">{asset.nama_gedung}</h1>
      </div>

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
                  ) : (
                    <div>
                      <p className="text-sm font-medium">Inspeksi — {item.data.status_air_terminal} / {item.data.status_down_conductor} / {item.data.status_grounding}</p>
                      <p className="text-xs text-gray-400">{formatDateTime(item.data.tgl_inspeksi)}</p>
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-300">{item.type === 'event' ? '⚡' : '📋'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

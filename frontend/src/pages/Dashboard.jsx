import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ResponsiveContainer, LineChart, Line, Tooltip as ReTooltip } from 'recharts'
import AssetMap from '../components/AssetMap'
import { UrgencyBadge } from '../components/StatusBadge'
import { SkeletonStat, SkeletonRow } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { formatDateTime, formatDate, HEALTH_BAND_HEX, HEALTH_BAND_LABEL, scoreToBand } from '../utils/constants'
import cacheStore from '../offline/cacheStore'
import { useIsManager } from '../auth/AuthContext'

function Sparkline({ data, color = '#1D4ED8' }) {
  if (!data || data.length === 0) return null
  return (
    <div className="h-10 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <Line
            type="monotone"
            dataKey="count"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <ReTooltip
            wrapperStyle={{ fontSize: '11px' }}
            content={({ payload }) =>
              payload && payload.length ? (
                <div className="bg-white shadow-card rounded-lg px-2 py-1 text-xs border border-gray-100">
                  <p className="text-gray-500">{payload[0].payload.day}</p>
                  <p className="font-semibold">{payload[0].value} kejadian</p>
                </div>
              ) : null
            }
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function StatCard({ title, value, icon, accent = 'brand', sparkData }) {
  const accents = {
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    green: 'bg-green-50 text-green-700',
  }
  const sparkColor = {
    brand: '#1D4ED8', amber: '#D97706', red: '#DC2626', green: '#16A34A',
  }
  return (
    <div className="card card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`text-xl p-2.5 rounded-xl ${accents[accent]}`}>{icon}</div>
          <div>
            <p className="text-xs text-gray-500 font-medium">{title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{value ?? '—'}</p>
          </div>
        </div>
        {sparkData && <Sparkline data={sparkData} color={sparkColor[accent]} />}
      </div>
    </div>
  )
}

function CriticalAssetCard({ asset, onClick }) {
  const ahiScore = asset.ahi_safety ?? asset.ahi_breakdown?.ahi_safety ?? asset.skor_kesehatan_aset
  const band     = scoreToBand(ahiScore)
  const hex      = HEALTH_BAND_HEX[band]
  const pct      = Math.round((ahiScore ?? 0) * 100)
  return (
    <button
      onClick={onClick}
      className="card card-hover text-left w-full hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{asset.nama_gedung}</p>
          <p className="text-xs text-gray-500">LPL {asset.lpl_grade}</p>
        </div>
        <span
          className="text-xs font-bold px-2 py-1 rounded-full"
          style={{ backgroundColor: `${hex}20`, color: hex }}
        >
          {pct}%
        </span>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${hex}, ${hex}cc)`,
          }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-2">{HEALTH_BAND_LABEL[band]}</p>
    </button>
  )
}

function ActivityRow({ icon, title, subtitle, accent = 'brand', onClick, badge }) {
  const accentBg = {
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-green-50 text-green-700',
  }
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-2.5 px-1 rounded-lg hover:bg-gray-50 transition-colors text-left"
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 ${accentBg[accent]}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{title}</p>
        <p className="text-xs text-gray-500 truncate">{subtitle}</p>
      </div>
      {badge}
    </button>
  )
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [mapAssets, setMapAssets] = useState([])
  const [isStale, setIsStale] = useState(false)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const isManager = useIsManager()

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

  const sparkData = summary?.events_sparkline || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ringkasan kondisi sistem proteksi petir</p>
        </div>
        {isStale && (
          <span className="pill bg-amber-50 text-amber-700">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Data tersimpan (offline)
          </span>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          <>
            <SkeletonStat /><SkeletonStat /><SkeletonStat /><SkeletonStat />
          </>
        ) : (
          <>
            <StatCard title="Total Aset" value={summary?.total_assets} icon="🏗️" accent="brand" />
            <StatCard title="Perlu Inspeksi" value={summary?.assets_needing_inspection} icon="⚠️" accent="amber" />
            <StatCard
              title="Kejadian 7 Hari"
              value={summary?.events_last_7_days}
              icon="⚡"
              accent="brand"
              sparkData={sparkData}
            />
            <StatCard title="Aset Kritis" value={summary?.critical_assets} icon="🚨" accent="red" />
          </>
        )}
      </div>

      {/* Critical assets row */}
      {!loading && summary?.critical_top3?.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">⚠️ Aset Paling Kritis</h2>
            <button
              onClick={() => navigate('/assets')}
              className="text-xs text-brand-700 hover:underline font-medium"
            >
              Lihat semua →
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[...(summary.critical_top3 ?? [])].sort((a, b) => {
              const aScore = a.ahi_safety ?? a.ahi_breakdown?.ahi_safety ?? a.skor_kesehatan_aset ?? 1
              const bScore = b.ahi_safety ?? b.ahi_breakdown?.ahi_safety ?? b.skor_kesehatan_aset ?? 1
              return aScore - bScore
            }).map((a, i) => (
              <div key={a.asset_id} className={`animate-fade-in-up stagger-${i + 1}`}>
                <CriticalAssetCard asset={a} onClick={() => navigate(`/assets/${a.asset_id}`)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity (events + inspections side by side) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-base font-semibold text-gray-800">⚡ Sambaran Terbaru</h2>
            <button
              onClick={() => navigate('/events/new')}
              className="text-xs text-brand-700 hover:underline font-medium"
            >
              Catat baru →
            </button>
          </div>
          {loading ? (
            <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
          ) : summary?.recent_events?.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {summary.recent_events.map((e) => (
                <ActivityRow
                  key={e.event_id}
                  icon="⚡"
                  accent="amber"
                  title={`${e.estimasi_arus_puncak_ka} kA · ${e.asset_nama_gedung}`}
                  subtitle={formatDateTime(e.timestamp)}
                  badge={e.fuzzy_output_label && <UrgencyBadge label={e.fuzzy_output_label} size="sm" />}
                  onClick={() => navigate(`/assets/${e.asset}`)}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon="⚡" title="Belum ada sambaran" description="Sambaran petir akan muncul di sini setelah dicatat." />
          )}
        </div>

        <div className="card">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-base font-semibold text-gray-800">📋 Inspeksi Terbaru</h2>
            <button
              onClick={() => navigate('/inspections')}
              className="text-xs text-brand-700 hover:underline font-medium"
            >
              Lihat riwayat →
            </button>
          </div>
          {loading ? (
            <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
          ) : summary?.recent_inspections?.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {summary.recent_inspections.map((insp) => {
                const allOk = insp.status_air_terminal === 'OK'
                  && insp.status_down_conductor === 'OK'
                  && insp.status_grounding === 'OK'
                return (
                  <ActivityRow
                    key={insp.log_id}
                    icon="📋"
                    accent={allOk ? 'green' : 'amber'}
                    title={`${insp.asset_nama_gedung} · ${insp.user_nama || insp.user_username || '—'}`}
                    subtitle={formatDate(insp.tgl_inspeksi)}
                    badge={
                      <span className={`pill ${allOk ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                        {allOk ? 'OK' : 'Perlu perhatian'}
                      </span>
                    }
                    onClick={() => navigate(`/assets/${insp.asset}`)}
                  />
                )
              })}
            </div>
          ) : (
            <EmptyState icon="📋" title="Belum ada inspeksi" description="Logbook inspeksi akan muncul di sini setelah dicatat." />
          )}
        </div>
      </div>

      {/* Map */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-baseline justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-800">🗺️ Peta Aset</h2>
            <p className="text-xs text-gray-500 mt-0.5">Klik pin untuk melihat detail aset</p>
          </div>
        </div>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Memuat peta...</div>
        ) : (
          <div className="p-3">
            <AssetMap assets={mapAssets} height="380px" />
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => navigate('/events/new')}
          className="card text-left card-hover hover:-translate-y-0.5 transition-all border border-brand-100 hover:border-brand-300"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center text-xl">⚡</div>
            <div>
              <p className="font-semibold text-gray-900">Catat Sambaran Petir</p>
              <p className="text-xs text-gray-500 mt-0.5">Rekam kejadian & dapatkan rekomendasi inspeksi</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => navigate('/inspections/new')}
          className="card text-left card-hover hover:-translate-y-0.5 transition-all border border-green-100 hover:border-green-300"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-50 text-green-700 flex items-center justify-center text-xl">📋</div>
            <div>
              <p className="font-semibold text-gray-900">Isi Logbook Inspeksi</p>
              <p className="text-xs text-gray-500 mt-0.5">Laporkan kondisi komponen & perbarui skor kesehatan</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}

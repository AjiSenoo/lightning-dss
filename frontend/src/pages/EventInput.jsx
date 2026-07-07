import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { UrgencyBadge } from '../components/StatusBadge'
import MagnitudeBadge from '../components/MagnitudeBadge'
import { URGENCY_ACTIONS, LPL_CAPACITY, formatDateTime, nowInJakarta } from '../utils/constants'
import useOfflineSubmit from '../hooks/useOfflineSubmit'
import cacheStore from '../offline/cacheStore'
import OnboardingTour from '../components/OnboardingTour'
import usePageTour from '../onboarding/usePageTour'
import { buildEventTour } from '../onboarding/tourSteps'

function StressGauge({ ratio }) {
  const pct = Math.min(ratio / 1.5, 1)
  const color = ratio < 0.35 ? '#22C55E' : ratio < 0.65 ? '#F59E0B' : '#EF4444'

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-500">Rasio Stres</span>
        <span className="font-bold" style={{ color }}>{(ratio * 100).toFixed(1)}%</span>
      </div>
      <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-4 rounded-full transition-all"
          style={{ width: `${pct * 100}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>0 kA</span>
        <span>Kapasitas desain</span>
        <span>1.5×</span>
      </div>
    </div>
  )
}

export default function EventInput() {
  const location = useLocation()
  const navigate = useNavigate()
  const { submitEvent, isSubmitting, isOnline } = useOfflineSubmit()
  const tour = usePageTour('event')

  const [assets, setAssets] = useState([])
  const [selectedAssetId, setSelectedAssetId] = useState(location.state?.assetId || '')
  const [ipeak, setIpeak] = useState('')
  const [catatan, setCatatan] = useState('')
  const [result, setResult] = useState(null)
  const [timestamp, setTimestamp] = useState(() => nowInJakarta())

  useEffect(() => {
    cacheStore.getAssets().then((r) => {
      setAssets(r.data || [])
    })
  }, [])

  const selectedAsset = assets.find((a) => a.asset_id === selectedAssetId)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedAssetId || !ipeak) return

    const eventData = {
      asset: selectedAssetId,
      timestamp: new Date(timestamp).toISOString(),
      estimasi_arus_puncak_ka: parseFloat(ipeak),
      catatan,
    }

    try {
      const res = await submitEvent(eventData, selectedAsset)
      setResult(res)
    } catch (err) {
      alert('Gagal menyimpan data: ' + (err.message || 'Error tidak diketahui'))
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Input Kejadian Sambaran Petir</h1>
        <button
          onClick={tour.start}
          className="shrink-0 w-8 h-8 rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors flex items-center justify-center text-sm font-semibold"
          title="Panduan langkah pada halaman ini"
          aria-label="Panduan langkah pada halaman ini"
        >
          ?
        </button>
      </div>

      {!isOnline && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          ⚡ Mode Offline — hasil akan menggunakan estimasi lokal dan disinkronkan saat online
        </div>
      )}

      {!result ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Step 1: Select asset */}
          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-700">1. Pilih Aset</h2>
            <select
              data-tour="event-asset"
              className="form-input"
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              required
            >
              <option value="">— Pilih gedung/fasilitas —</option>
              {assets.map((a) => (
                <option key={a.asset_id} value={a.asset_id}>
                  {a.nama_gedung} (LPL {a.lpl_grade}, {LPL_CAPACITY[a.lpl_grade]} kA)
                </option>
              ))}
            </select>
            {selectedAsset && (
              <div className="text-sm bg-blue-50 p-3 rounded-lg space-y-1">
                <p><span className="text-gray-500">Kapasitas desain:</span> <strong>{selectedAsset.kapasitas_desain_ka} kA</strong></p>
                <p><span className="text-gray-500">Skor kesehatan:</span> <strong>{Math.round(selectedAsset.skor_kesehatan_aset * 100)}%</strong></p>
              </div>
            )}
          </div>

          {/* Step 2: Input Ipeak */}
          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-700">2. Arus Puncak</h2>
            <div className="relative" data-tour="event-ipeak">
              <input
                type="number"
                className="form-input pr-12 text-xl h-16"
                placeholder="80"
                min="1"
                max="500"
                step="0.1"
                value={ipeak}
                onChange={(e) => setIpeak(e.target.value)}
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">kA</span>
            </div>
            {ipeak && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Kategori magnitudo (kA absolut)</span>
                <MagnitudeBadge ipeak={ipeak} size="lg" showHint />
              </div>
            )}
            {ipeak && selectedAsset && (
              <StressGauge ratio={parseFloat(ipeak) / selectedAsset.kapasitas_desain_ka} />
            )}
            <div data-tour="event-waktu">
              <label className="text-sm text-gray-500">Waktu Kejadian</label>
              <input
                type="datetime-local"
                className="form-input mt-1"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Step 3: Notes */}
          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-700">3. Catatan</h2>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Catatan tambahan (opsional)"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </div>

          <button type="submit" data-tour="event-submit" className="btn-primary w-full py-3" disabled={isSubmitting}>
            {isSubmitting ? 'Memproses...' : 'Analisis & Simpan'}
          </button>
        </form>
      ) : (
        /* Result card */
        <div className="space-y-4">
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800">Hasil Analisis</h2>
              {result.provisional && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
                  ⚡ Estimasi lokal
                </span>
              )}
            </div>

            {/* Magnitude category (absolute kA) + stress gauge */}
            <div className="flex items-center justify-between">
              <span className="text-gray-500 text-sm">Kategori Magnitudo</span>
              <MagnitudeBadge ipeak={result.estimasi_arus_puncak_ka ?? parseFloat(ipeak)} size="lg" showHint />
            </div>
            <StressGauge ratio={result.rasio_stres || 0} />

            {/* Fuzzy output */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">Tingkat Urgensi</span>
                <UrgencyBadge label={result.fuzzy_output_label} size="lg" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">Skor IUI</span>
                <span className="text-2xl font-bold">{result.fuzzy_output_score?.toFixed(1) ?? '—'}</span>
              </div>
              <div className="border-t pt-3">
                <p className="text-sm font-medium text-gray-700">Rekomendasi Tindakan:</p>
                <p className="text-sm text-gray-600 mt-1">
                  {URGENCY_ACTIONS[result.fuzzy_output_label] || '—'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              className="btn-primary flex-1"
              onClick={() => navigate('/inspections/new', { state: { eventId: result.event_id, assetId: selectedAssetId } })}
            >
              📋 Buat Tiket Inspeksi →
            </button>
            <button
              className="btn-secondary"
              onClick={() => { setResult(null); setIpeak(''); setCatatan('') }}
            >
              Input Baru
            </button>
          </div>
        </div>
      )}

      <OnboardingTour
        steps={buildEventTour()}
        active={tour.active}
        onFinish={tour.finish}
      />
    </div>
  )
}

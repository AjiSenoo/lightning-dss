import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { COMPONENT_OPTIONS, LPL_LABELS, getHealthStatus } from '../utils/constants'
import useOfflineSubmit from '../hooks/useOfflineSubmit'
import cacheStore from '../offline/cacheStore'
import client from '../api/client'

function RadioCards({ options, value, onChange }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex flex-col items-center p-3 rounded-xl cursor-pointer text-center text-sm transition-all ${
            value === opt.value
              ? 'border-2 border-blue-500 bg-blue-50 font-semibold text-blue-800'
              : 'border-2 border-gray-200 bg-white hover:border-gray-300 text-gray-700'
          }`}
        >
          <input
            type="radio"
            name={`radio-${opt.value}`}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          {opt.label}
        </label>
      ))}
    </div>
  )
}

export default function LogbookForm() {
  const location = useLocation()
  const navigate = useNavigate()
  const { submitInspection, isSubmitting, isOnline } = useOfflineSubmit()

  const [assets, setAssets] = useState([])
  const [selectedAssetId, setSelectedAssetId] = useState(location.state?.assetId || '')
  const [eventId] = useState(location.state?.eventId || '')
  const [showOptional, setShowOptional] = useState(false)
  const [result, setResult] = useState(null)

  const [form, setForm] = useState({
    status_air_terminal: 'OK',
    status_down_conductor: 'OK',
    status_grounding: 'OK',
    resistansi_grounding_ohm: '',
    status_spd: '',
    arus_bocor_spd_ma: '',
    status_bonding: '',
    status_kabel_instalasi: '',
    catatan_teknisi: '',
    tgl_inspeksi: new Date().toISOString().slice(0, 16),
    user: '',
  })

  useEffect(() => {
    cacheStore.getAssets().then((r) => setAssets(r.data || []))
  }, [])

  const selectedAsset = assets.find((a) => a.asset_id === selectedAssetId)

  const setField = (key) => (val) => setForm((prev) => ({ ...prev, [key]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedAssetId) return

    const payload = {
      asset: selectedAssetId,
      event: eventId || null,
      tgl_inspeksi: new Date(form.tgl_inspeksi).toISOString(),
      status_air_terminal: form.status_air_terminal,
      status_down_conductor: form.status_down_conductor,
      status_grounding: form.status_grounding,
      resistansi_grounding_ohm: form.resistansi_grounding_ohm ? parseFloat(form.resistansi_grounding_ohm) : null,
      status_spd: form.status_spd,
      arus_bocor_spd_ma: form.arus_bocor_spd_ma ? parseFloat(form.arus_bocor_spd_ma) : null,
      status_bonding: form.status_bonding,
      status_kabel_instalasi: form.status_kabel_instalasi,
      catatan_teknisi: form.catatan_teknisi,
    }

    try {
      const res = await submitInspection(payload, selectedAsset)
      setResult(res)
    } catch (err) {
      alert('Gagal menyimpan: ' + (err.message || 'Error'))
    }
  }

  if (result) {
    const before = result.health_before ?? 0
    const after = result.health_after ?? 0
    const delta = after - before
    const colorBefore = getHealthStatus(before)
    const colorAfter = getHealthStatus(after)

    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div className="card space-y-4 text-center">
          <h2 className="font-bold text-xl text-gray-800">Logbook Tersimpan</h2>
          {result.provisional && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
              Tersimpan lokal — akan dikirim saat online
            </p>
          )}
          <div className="flex items-center justify-center gap-6">
            <div>
              <p className="text-xs text-gray-400 mb-1">Sebelum</p>
              <p className="text-3xl font-bold" style={{ color: colorBefore.bg }}>
                {Math.round(before * 100)}%
              </p>
            </div>
            <p className="text-2xl text-gray-400">→</p>
            <div>
              <p className="text-xs text-gray-400 mb-1">Sesudah</p>
              <p className="text-3xl font-bold" style={{ color: colorAfter.bg }}>
                {Math.round(after * 100)}%
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            Skor kesehatan {delta >= 0 ? 'meningkat' : 'menurun'}{' '}
            <strong>{delta >= 0 ? '+' : ''}{Math.round(delta * 100)}%</strong>
          </p>
        </div>
        <div className="flex gap-3">
          <button className="btn-primary flex-1" onClick={() => navigate('/assets')}>
            Lihat Portofolio
          </button>
          <button className="btn-secondary" onClick={() => { setResult(null) }}>
            Input Baru
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Logbook Inspeksi</h1>

      {!isOnline && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          Mode Offline — data tersimpan lokal dan dikirim saat online
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Asset & Event header */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-700">Informasi Inspeksi</h2>
          <select
            className="form-input"
            value={selectedAssetId}
            onChange={(e) => setSelectedAssetId(e.target.value)}
            required
          >
            <option value="">— Pilih aset yang diinspeksi —</option>
            {assets.map((a) => (
              <option key={a.asset_id} value={a.asset_id}>
                {a.nama_gedung} (LPL {a.lpl_grade})
              </option>
            ))}
          </select>
          {selectedAsset && (
            <div className="text-sm bg-blue-50 p-3 rounded-lg">
              <p>Skor kesehatan: <strong>{Math.round(selectedAsset.skor_kesehatan_aset * 100)}%</strong></p>
              {eventId && <p className="text-xs text-gray-500 mt-1">Terhubung ke kejadian sambaran petir</p>}
            </div>
          )}
          <div>
            <label className="text-sm text-gray-500">Tanggal & Waktu Inspeksi</label>
            <input
              type="datetime-local"
              className="form-input mt-1"
              value={form.tgl_inspeksi}
              onChange={(e) => setField('tgl_inspeksi')(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Required components */}
        <div className="card space-y-5">
          <h2 className="font-semibold text-gray-700">Komponen Wajib</h2>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">🔩 Air Terminal</p>
            <RadioCards
              options={COMPONENT_OPTIONS.air_terminal}
              value={form.status_air_terminal}
              onChange={setField('status_air_terminal')}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">🔧 Down Conductor</p>
            <RadioCards
              options={COMPONENT_OPTIONS.down_conductor}
              value={form.status_down_conductor}
              onChange={setField('status_down_conductor')}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">⚡ Grounding</p>
            <RadioCards
              options={COMPONENT_OPTIONS.grounding}
              value={form.status_grounding}
              onChange={setField('status_grounding')}
            />
          </div>
          <div>
            <label className="text-sm text-gray-500">Resistansi Grounding (Ω) — opsional</label>
            <input
              type="number"
              className="form-input mt-1"
              placeholder="mis. 3.5"
              step="0.01"
              value={form.resistansi_grounding_ohm}
              onChange={(e) => setField('resistansi_grounding_ohm')(e.target.value)}
            />
          </div>
        </div>

        {/* Optional components */}
        <div className="card space-y-4">
          <button
            type="button"
            className="flex items-center gap-2 font-semibold text-gray-700 w-full text-left"
            onClick={() => setShowOptional((v) => !v)}
          >
            Komponen Tambahan {showOptional ? '▲' : '▼'}
          </button>
          {showOptional && (
            <div className="space-y-4 pt-2 border-t">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">SPD (Surge Protective Device)</p>
                <select className="form-input" value={form.status_spd} onChange={(e) => setField('status_spd')(e.target.value)}>
                  {COMPONENT_OPTIONS.spd.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {form.status_spd && (
                  <input type="number" className="form-input mt-2" placeholder="Arus bocor (mA)" step="0.01"
                    value={form.arus_bocor_spd_ma} onChange={(e) => setField('arus_bocor_spd_ma')(e.target.value)} />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Bonding (Ekuipotensial)</p>
                <select className="form-input" value={form.status_bonding} onChange={(e) => setField('status_bonding')(e.target.value)}>
                  {COMPONENT_OPTIONS.bonding.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Kabel Instalasi</p>
                <select className="form-input" value={form.status_kabel_instalasi} onChange={(e) => setField('status_kabel_instalasi')(e.target.value)}>
                  {COMPONENT_OPTIONS.kabel.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Evidence */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-700">Bukti & Catatan</h2>
          <textarea
            className="form-input"
            rows={3}
            placeholder="Catatan teknisi — deskripsikan kondisi yang ditemukan..."
            value={form.catatan_teknisi}
            onChange={(e) => setField('catatan_teknisi')(e.target.value)}
          />
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-400 text-sm">
            📷 Upload foto bukti (Sprint 2)
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={isSubmitting || !selectedAssetId}>
          {isSubmitting ? 'Menyimpan...' : 'Simpan Logbook Inspeksi'}
        </button>
      </form>
    </div>
  )
}

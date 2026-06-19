import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { COMPONENT_OPTIONS, LPL_LABELS, formatDateTime, HEALTH_BAND_HEX, HEALTH_BAND_LABEL, scoreToBand } from '../utils/constants'
import useOfflineSubmit from '../hooks/useOfflineSubmit'
import cacheStore from '../offline/cacheStore'
import client from '../api/client'

const NON_OK = {
  status_air_terminal:   (v) => v !== 'OK',
  status_down_conductor: (v) => v !== 'OK',
  status_grounding:      (v) => v !== 'OK',
  status_bonding:        (v) => v !== '' && v !== 'OK',
  status_spd:            (v) => v !== '' && v !== 'OK',
}

function AHIChip({ ahi }) {
  if (ahi == null) return null
  const band = scoreToBand(ahi)
  const hex  = HEALTH_BAND_HEX[band]
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${hex}20`, color: hex }}>
      {HEALTH_BAND_LABEL[band]} · {Math.round(ahi * 100)}%
    </span>
  )
}

async function compressImage(file, maxKB = 500) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      const maxDim = 1280
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim }
        else { width = Math.round(width * maxDim / height); height = maxDim }
      }
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      let quality = 0.85
      const attempt = () => canvas.toBlob((blob) => {
        if (!blob || blob.size <= maxKB * 1024 || quality < 0.3) resolve(blob ?? new Blob())
        else { quality -= 0.1; attempt() }
      }, 'image/jpeg', quality)
      attempt()
    }
    img.src = url
  })
}

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
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit')
  const amendId = searchParams.get('amend')
  const mode = editId ? 'edit' : amendId ? 'amend' : 'create'
  const sourceLogId = editId || amendId

  const { submitInspection, isSubmitting, isOnline } = useOfflineSubmit()
  const fileInputRef = useRef(null)

  const [assets, setAssets] = useState([])
  const [selectedAssetId, setSelectedAssetId] = useState(location.state?.assetId || '')
  const [eventId, setEventId] = useState(location.state?.eventId || '')
  const [showOptional, setShowOptional] = useState(false)
  const [result, setResult] = useState(null)
  const [photos, setPhotos] = useState([]) // [{blob: Blob, previewUrl: string}]
  const [existingPhotos, setExistingPhotos] = useState([]) // [{photo_id, image, caption}]
  const [sourceLog, setSourceLog] = useState(null) // log being edited/amended
  const [loadError, setLoadError] = useState('')

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

  useEffect(() => {
    if (!sourceLogId) return
    let cancelled = false
    client.get(`/inspections/${sourceLogId}/`)
      .then((res) => {
        if (cancelled) return
        const log = res.data
        if (mode === 'edit' && log.verified_at) {
          if (!cancelled) setLoadError('Laporan ini sudah terverifikasi. Cabut verifikasi terlebih dahulu untuk mengedit.')
          return
        }
        setSourceLog(log)
        setSelectedAssetId(log.asset || '')
        setEventId(log.event || '')
        setExistingPhotos(log.photos || [])
        const isoLocal = log.tgl_inspeksi ? log.tgl_inspeksi.slice(0, 16) : new Date().toISOString().slice(0, 16)
        setForm({
          status_air_terminal: log.status_air_terminal || 'OK',
          status_down_conductor: log.status_down_conductor || 'OK',
          status_grounding: log.status_grounding || 'OK',
          resistansi_grounding_ohm: log.resistansi_grounding_ohm ?? '',
          status_spd: log.status_spd || '',
          arus_bocor_spd_ma: log.arus_bocor_spd_ma ?? '',
          status_bonding: log.status_bonding || '',
          status_kabel_instalasi: log.status_kabel_instalasi || '',
          catatan_teknisi: log.catatan_teknisi || '',
          tgl_inspeksi: isoLocal,
          user: '',
        })
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err?.response?.data?.detail || 'Gagal memuat log inspeksi.')
      })
    return () => { cancelled = true }
  }, [sourceLogId])

  const selectedAsset = assets.find((a) => a.asset_id === selectedAssetId)
  const hasIssue = Object.entries(NON_OK).some(([k, check]) => check(form[k]))
  // Existing photos count toward the requirement on edit (immutable on edit; new uploads append)
  const needsPhoto = hasIssue && photos.length === 0 && existingPhotos.length === 0

  const setField = (key) => (val) => setForm((prev) => ({ ...prev, [key]: val }))

  const handleFilePick = async (e) => {
    const files = Array.from(e.target.files)
    const compressed = await Promise.all(files.map((f) => compressImage(f)))
    const entries = compressed.map((blob) => ({ blob, previewUrl: URL.createObjectURL(blob) }))
    setPhotos((prev) => [...prev, ...entries])
    e.target.value = ''
  }

  const removePhoto = (idx) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[idx].previewUrl)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedAssetId) return
    if (needsPhoto) return // guarded by disabled button too

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

    const blobs = photos.map((p) => p.blob)

    try {
      const res = await submitInspection(payload, selectedAsset, blobs, mode, sourceLogId)
      setResult(res)
    } catch (err) {
      const detail = err?.response?.data
      const msg = typeof detail === 'string'
        ? detail
        : detail
        ? JSON.stringify(detail)
        : err.message || 'Error'
      alert('Gagal menyimpan: ' + msg)
    }
  }

  if (result) {
    const before = result.health_before ?? 0
    const after  = result.health_after  ?? 0
    const delta  = after - before
    const hexBefore = HEALTH_BAND_HEX[scoreToBand(before)]
    const hexAfter  = HEALTH_BAND_HEX[scoreToBand(after)]

    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div className="card space-y-4 text-center">
          <h2 className="font-bold text-xl text-gray-800">
            {mode === 'edit' ? 'Perubahan Tersimpan' : mode === 'amend' ? 'Amandemen Tersimpan' : 'Logbook Tersimpan'}
          </h2>
          {result.provisional && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
              Tersimpan lokal — akan dikirim saat online
            </p>
          )}
          <div className="flex items-center justify-center gap-6">
            <div>
              <p className="text-xs text-gray-400 mb-1">Sebelum</p>
              <p className="text-3xl font-bold" style={{ color: hexBefore }}>
                {Math.round(before * 100)}%
              </p>
              <p className="text-xs mt-1" style={{ color: hexBefore }}>{HEALTH_BAND_LABEL[scoreToBand(before)]}</p>
            </div>
            <p className="text-2xl text-gray-400">→</p>
            <div>
              <p className="text-xs text-gray-400 mb-1">Sesudah</p>
              <p className="text-3xl font-bold" style={{ color: hexAfter }}>
                {Math.round(after * 100)}%
              </p>
              <p className="text-xs mt-1" style={{ color: hexAfter }}>{HEALTH_BAND_LABEL[scoreToBand(after)]}</p>
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

  const pageTitle = mode === 'edit'
    ? 'Edit Logbook Inspeksi'
    : mode === 'amend'
    ? 'Amandemen Logbook Inspeksi'
    : 'Logbook Inspeksi'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
          {loadError}
        </div>
      )}

      {mode === 'amend' && sourceLog && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          📝 Mengamandemen log dari <strong>{formatDateTime(sourceLog.tgl_inspeksi)}</strong>
          {sourceLog.user_nama && <> oleh <strong>{sourceLog.user_nama}</strong></>}.
          Log baru akan dibuat dan ditautkan ke log asal.
        </div>
      )}

      {mode === 'edit' && sourceLog && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
          ✏️ Mengedit log dari <strong>{formatDateTime(sourceLog.tgl_inspeksi)}</strong>. Foto yang sudah ada tidak dapat dihapus, tapi foto baru bisa ditambahkan.
        </div>
      )}

      {!isOnline && mode === 'create' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          Mode Offline — data tersimpan lokal dan dikirim saat online
        </div>
      )}

      {!isOnline && mode !== 'create' && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
          Edit dan amandemen hanya tersedia saat online.
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
            disabled={mode !== 'create'}
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
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm font-medium text-gray-700">🔩 Air Terminal</p>
              <AHIChip ahi={selectedAsset?.ahi_breakdown?.per_component?.AT?.ahi} />
            </div>
            <RadioCards
              options={COMPONENT_OPTIONS.air_terminal}
              value={form.status_air_terminal}
              onChange={setField('status_air_terminal')}
            />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm font-medium text-gray-700">🔧 Down Conductor</p>
              <AHIChip ahi={selectedAsset?.ahi_breakdown?.per_component?.DC?.ahi} />
            </div>
            <RadioCards
              options={COMPONENT_OPTIONS.down_conductor}
              value={form.status_down_conductor}
              onChange={setField('status_down_conductor')}
            />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm font-medium text-gray-700">⚡ Grounding</p>
              <AHIChip ahi={selectedAsset?.ahi_breakdown?.per_component?.GR?.ahi} />
            </div>
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
            Komponen LPS Internal — SPD & Bonding {showOptional ? '▲' : '▼'}
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

          {/* Existing photos (read-only) */}
          {existingPhotos.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Foto bukti tersimpan ({existingPhotos.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {existingPhotos.map((p) => (
                  <img
                    key={p.photo_id}
                    src={p.image}
                    alt={p.caption || 'foto bukti'}
                    className="w-20 h-20 object-cover rounded-lg border border-gray-200 opacity-90"
                  />
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Foto tersimpan tidak dapat dihapus.</p>
            </div>
          )}

          {/* Photo upload */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <p className="text-sm font-medium text-gray-700">
                {existingPhotos.length > 0 ? 'Tambah Foto Baru' : 'Foto Bukti'}
                {hasIssue && existingPhotos.length === 0 && <span className="text-red-500 ml-1">*</span>}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-lg"
              >
                + Tambah Foto
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFilePick}
              />
            </div>

            {needsPhoto && (
              <p className="text-xs text-red-600 mb-2">
                Foto wajib jika ada komponen tidak OK
              </p>
            )}

            {photos.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative">
                    <img
                      src={p.previewUrl}
                      alt={`foto-${i + 1}`}
                      className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-400 text-sm cursor-pointer hover:border-gray-300"
                onClick={() => fileInputRef.current?.click()}
              >
                Klik untuk tambah foto bukti
              </div>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary w-full py-3"
          disabled={
            isSubmitting
            || !selectedAssetId
            || needsPhoto
            || (!isOnline && mode !== 'create')
          }
        >
          {isSubmitting
            ? 'Menyimpan...'
            : mode === 'edit'
            ? 'Simpan Perubahan'
            : mode === 'amend'
            ? 'Submit Amandemen'
            : 'Simpan Logbook Inspeksi'}
        </button>
      </form>
    </div>
  )
}

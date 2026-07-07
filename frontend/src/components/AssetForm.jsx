import { useState, useEffect } from 'react'
import client from '../api/client'
import { LPL_LABELS, todayInJakarta } from '../utils/constants'

const LPL_OPTIONS = ['I', 'II', 'III', 'IV']

const today = () => todayInJakarta()

const EMPTY = {
  nama_gedung: '',
  lokasi_gps: '',
  lpl_grade: 'III',
  tanggal_instalasi: today(),
  jenis_material_konduktor: '',
  resistivitas_tanah: '',
  catatan: '',
}

function validateGps(s) {
  if (!s) return false
  const parts = s.split(',').map((p) => p.trim())
  if (parts.length !== 2) return false
  const [lat, lng] = parts.map(parseFloat)
  return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

export default function AssetForm({ asset = null, onClose, onSaved }) {
  const isEdit = !!asset
  const [form, setForm] = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (asset) {
      setForm({
        nama_gedung: asset.nama_gedung || '',
        lokasi_gps: asset.lokasi_gps || '',
        lpl_grade: asset.lpl_grade || 'III',
        tanggal_instalasi:
          asset.tanggal_instalasi ||
          (asset.tahun_instalasi ? `${asset.tahun_instalasi}-01-01` : today()),
        jenis_material_konduktor: asset.jenis_material_konduktor || '',
        resistivitas_tanah: asset.resistivitas_tanah ?? '',
        catatan: asset.catatan || '',
      })
    } else {
      setForm(EMPTY)
    }
  }, [asset])

  const setField = (key) => (val) => setForm((prev) => ({ ...prev, [key]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!validateGps(form.lokasi_gps)) {
      setError('Format Lokasi GPS harus "lat, lng" — contoh: -6.3413, 108.3476')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        resistivitas_tanah: form.resistivitas_tanah === '' ? null : parseFloat(form.resistivitas_tanah),
      }
      const res = isEdit
        ? await client.put(`/assets/${asset.asset_id}/`, payload)
        : await client.post('/assets/', payload)
      onSaved?.(res.data)
      onClose?.()
    } catch (err) {
      const detail = err?.response?.data
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Gagal menyimpan aset')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 my-8 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            {isEdit ? 'Edit Aset' : 'Tambah Aset Baru'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700">Nama Gedung *</label>
            <input
              className="form-input mt-1"
              value={form.nama_gedung}
              onChange={(e) => setField('nama_gedung')(e.target.value)}
              required
              placeholder="mis. Kilang Balongan - Unit Distilasi"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Lokasi GPS (lat, lng) *</label>
            <input
              className="form-input mt-1"
              value={form.lokasi_gps}
              onChange={(e) => setField('lokasi_gps')(e.target.value)}
              required
              placeholder="-6.3413, 108.3476"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">LPL Grade *</label>
            <div className="grid grid-cols-4 gap-2">
              {LPL_OPTIONS.map((lpl) => (
                <label
                  key={lpl}
                  className={`flex flex-col items-center p-2 rounded-lg cursor-pointer text-xs transition-all ${
                    form.lpl_grade === lpl
                      ? 'border-2 border-blue-500 bg-blue-50 font-semibold text-blue-800'
                      : 'border-2 border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    value={lpl}
                    checked={form.lpl_grade === lpl}
                    onChange={() => setField('lpl_grade')(lpl)}
                    className="sr-only"
                  />
                  {LPL_LABELS[lpl]}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Tanggal Instalasi *</label>
              <input
                type="date"
                max={today()}
                className="form-input mt-1"
                value={form.tanggal_instalasi}
                onChange={(e) => setField('tanggal_instalasi')(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Resistivitas Tanah (Ω·m)</label>
              <input
                type="number"
                step="0.1"
                className="form-input mt-1"
                value={form.resistivitas_tanah}
                onChange={(e) => setField('resistivitas_tanah')(e.target.value)}
                placeholder="opsional"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Material Konduktor</label>
            <input
              className="form-input mt-1"
              value={form.jenis_material_konduktor}
              onChange={(e) => setField('jenis_material_konduktor')(e.target.value)}
              placeholder="mis. Tembaga, Aluminium"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Catatan</label>
            <textarea
              className="form-input mt-1"
              rows={3}
              value={form.catatan}
              onChange={(e) => setField('catatan')(e.target.value)}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={submitting}>
              {submitting ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Tambah Aset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { UrgencyBadge } from '../components/StatusBadge'
import FuzzyVisualizer from '../components/FuzzyVisualizer'
import { LPL_LABELS, URGENCY_ACTIONS, getHealthStatus } from '../utils/constants'
import client from '../api/client'
import cacheStore from '../offline/cacheStore'

export default function Recommendation() {
  const [assets, setAssets] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [rStress, setRStress] = useState(0.5)
  const [dAsset, setDAsset] = useState(0.3)
  const [simResult, setSimResult] = useState(null)
  const [simLoading, setSimLoading] = useState(false)

  useEffect(() => {
    cacheStore.getAssets().then((r) => {
      setAssets(r.data || [])
    })
  }, [])

  const selectedAsset = assets.find((a) => a.asset_id === selectedId)

  useEffect(() => {
    if (selectedAsset) {
      setDAsset(selectedAsset.d_asset ?? 1 - selectedAsset.skor_kesehatan_aset)
    }
  }, [selectedId])

  const runSimulation = async () => {
    setSimLoading(true)
    try {
      const res = await client.get(`/fuzzy/simulate/?r_stress=${rStress}&d_asset=${dAsset}`)
      setSimResult(res.data)
    } catch {
      // Offline fallback
      const { localFuzzyApprox } = await import('../offline/fuzzyLookupTable')
      const local = localFuzzyApprox(rStress * 100, 'I', 1 - dAsset)
      setSimResult({ score: local.score, label: local.label, provisional: true })
    } finally {
      setSimLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Rekomendasi & Analisis Fuzzy</h1>

      {/* Asset selector */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-700">Pilih Aset untuk Laporan Kesehatan</h2>
        <select
          className="form-input"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">— Pilih aset —</option>
          {assets.map((a) => (
            <option key={a.asset_id} value={a.asset_id}>
              {a.nama_gedung} (LPL {a.lpl_grade}) — Kesehatan {Math.round(a.skor_kesehatan_aset * 100)}%
            </option>
          ))}
        </select>
        {selectedAsset && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-400 text-xs">Skor Kesehatan</p>
              <p className="font-bold text-lg" style={{ color: getHealthStatus(selectedAsset.skor_kesehatan_aset).bg }}>
                {Math.round(selectedAsset.skor_kesehatan_aset * 100)}%
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-400 text-xs">D_asset</p>
              <p className="font-bold text-lg">{((selectedAsset.d_asset ?? 1 - selectedAsset.skor_kesehatan_aset) * 100).toFixed(1)}%</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-400 text-xs">LPL</p>
              <p className="font-bold">{LPL_LABELS[selectedAsset.lpl_grade]}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-400 text-xs">Kapasitas</p>
              <p className="font-bold">{selectedAsset.kapasitas_desain_ka} kA</p>
            </div>
          </div>
        )}
      </div>

      {/* Fuzzy MF Visualization */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-4">Visualisasi Fungsi Keanggotaan Fuzzy</h2>
        <FuzzyVisualizer
          rStress={rStress}
          dAsset={dAsset}
          iuiScore={simResult?.score}
        />
      </div>

      {/* Interactive simulator */}
      <div className="card space-y-5">
        <h2 className="font-semibold text-gray-700">Simulator Interaktif</h2>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <label className="text-gray-600">R_stress (Rasio Stres)</label>
              <span className="font-semibold">{rStress.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0} max={1.5} step={0.01}
              value={rStress}
              onChange={(e) => setRStress(parseFloat(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>0 (tanpa stres)</span>
              <span>0.65 (batas)</span>
              <span>1.5 (ekstrem)</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <label className="text-gray-600">D_asset (Degradasi Aset)</label>
              <span className="font-semibold">{dAsset.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0} max={1} step={0.01}
              value={dAsset}
              onChange={(e) => setDAsset(parseFloat(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>0 (prima)</span>
              <span>0.4 (degradasi)</span>
              <span>1.0 (kritis)</span>
            </div>
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={runSimulation}
          disabled={simLoading}
        >
          {simLoading ? 'Menghitung...' : 'Jalankan Inferensi Fuzzy'}
        </button>

        {simResult && (
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Hasil IUI</span>
              <UrgencyBadge label={simResult.label} size="lg" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Skor</span>
              <span className="text-3xl font-bold">{simResult.score?.toFixed(1)}</span>
            </div>
            <div className="border-t pt-3 text-sm text-gray-600">
              {URGENCY_ACTIONS[simResult.label]}
            </div>
            {simResult.provisional && (
              <p className="text-xs text-amber-600">Estimasi lokal (offline)</p>
            )}
          </div>
        )}
      </div>

      {/* 3x3 Rule matrix */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-4">Matriks Aturan Fuzzy (3×3)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-200 px-3 py-2 bg-gray-50"></th>
                <th className="border border-gray-200 px-3 py-2 bg-gray-50">R_stress = Rendah</th>
                <th className="border border-gray-200 px-3 py-2 bg-gray-50">R_stress = Sedang</th>
                <th className="border border-gray-200 px-3 py-2 bg-gray-50">R_stress = Tinggi</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['D_asset = Prima', 'Rutin', 'Rutin', 'Prioritas'],
                ['D_asset = Degradasi', 'Rutin', 'Prioritas', 'Darurat'],
                ['D_asset = Kritis', 'Prioritas', 'Darurat', 'Darurat'],
              ].map(([row, ...cells]) => (
                <tr key={row}>
                  <td className="border border-gray-200 px-3 py-2 font-medium bg-gray-50">{row}</td>
                  {cells.map((cell, i) => {
                    const color = cell === 'Rutin' ? 'bg-green-50 text-green-700' : cell === 'Prioritas' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                    return (
                      <td key={i} className={`border border-gray-200 px-3 py-2 font-semibold ${color}`}>
                        {cell}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

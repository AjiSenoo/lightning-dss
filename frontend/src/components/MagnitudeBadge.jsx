import { classifyMagnitudeKa, DAMAGE_ONSET_KA } from '../utils/constants'

// Absolute-kA magnitude chip (Kecil / Sedang Kecil / Sedang / Besar).
// Display layer only — mirrors backend fuzzy_config.MAGNITUDE_KA_BANDS. Does not
// replace the stress-ratio gauge, which stays as the physics-based severity view.
export default function MagnitudeBadge({ ipeak, size = 'sm', showHint = false }) {
  if (ipeak === null || ipeak === undefined || ipeak === '' || Number.isNaN(Number(ipeak))) {
    return null
  }
  const m = classifyMagnitudeKa(ipeak)
  const px = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
  // Choose readable text colour for light band backgrounds (sedang_kecil is yellow).
  const dark = m.key === 'sedang_kecil'
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span
        className={`inline-flex items-center gap-1 rounded-full font-semibold ${px}`}
        style={{ backgroundColor: m.color, color: dark ? '#000' : '#fff' }}
        title={`Kategori magnitudo sambaran: ${m.label}`}
      >
        ⚡ {m.label}
      </span>
      {showHint && Number(ipeak) >= DAMAGE_ONSET_KA && (
        <span className="text-[11px] text-gray-500">
          {m.key === 'besar'
            ? 'Sambaran besar — picu inspeksi insidental'
            : `Kerusakan umumnya muncul > ${DAMAGE_ONSET_KA} kA`}
        </span>
      )}
    </span>
  )
}

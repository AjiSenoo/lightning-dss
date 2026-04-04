/**
 * Client-Side Fuzzy Approximation (Offline Mode).
 * Pre-computed 3×3 lookup table matching the Mamdani 9-rule matrix.
 * Provisional results — server recalculates when synced.
 */

const FUZZY_LOOKUP = {
  'low_prima':      { score: 15, label: 'Inspeksi Rutin' },
  'low_degradasi':  { score: 25, label: 'Inspeksi Rutin' },
  'low_kritis':     { score: 55, label: 'Inspeksi Prioritas' },
  'med_prima':      { score: 25, label: 'Inspeksi Rutin' },
  'med_degradasi':  { score: 55, label: 'Inspeksi Prioritas' },
  'med_kritis':     { score: 85, label: 'Inspeksi Darurat' },
  'high_prima':     { score: 55, label: 'Inspeksi Prioritas' },
  'high_degradasi': { score: 85, label: 'Inspeksi Darurat' },
  'high_kritis':    { score: 95, label: 'Inspeksi Darurat' },
}

const LPL_CAPACITY = { I: 200, II: 150, III: 100, IV: 100 }

/**
 * Run a local fuzzy approximation for offline mode.
 *
 * @param {number} arusPuncak - Peak current in kA
 * @param {string} lplGrade - LPL grade ('I', 'II', 'III', 'IV')
 * @param {number} healthScore - Current asset health score (0–1)
 * @returns {{ score, label, provisional, r_stress, d_asset }}
 */
export function localFuzzyApprox(arusPuncak, lplGrade, healthScore) {
  const capacity = LPL_CAPACITY[lplGrade] || 100
  const rStress = arusPuncak / capacity
  const dAsset = 1.0 - healthScore

  const stressBucket = rStress < 0.35 ? 'low' : rStress < 0.65 ? 'med' : 'high'
  const degradBucket = dAsset < 0.25 ? 'prima' : dAsset < 0.55 ? 'degradasi' : 'kritis'

  const key = `${stressBucket}_${degradBucket}`
  const result = FUZZY_LOOKUP[key] || { score: 50, label: 'Inspeksi Prioritas' }

  return {
    ...result,
    provisional: true,
    r_stress: Math.round(rStress * 100) / 100,
    d_asset: Math.round(dAsset * 100) / 100,
  }
}

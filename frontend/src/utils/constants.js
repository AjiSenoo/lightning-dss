export const STATUS_COLORS = {
  aman:    { bg: '#22C55E', text: '#FFFFFF', label: 'Aman' },
  waspada: { bg: '#F59E0B', text: '#000000', label: 'Waspada' },
  bahaya:  { bg: '#EF4444', text: '#FFFFFF', label: 'Bahaya' },
  neutral: { bg: '#6B7280', text: '#FFFFFF', label: 'Belum Ada Data' },
}

export const getHealthStatus = (score) => {
  if (score === null || score === undefined) return STATUS_COLORS.neutral
  if (score > 0.7) return STATUS_COLORS.aman
  if (score >= 0.4) return STATUS_COLORS.waspada
  return STATUS_COLORS.bahaya
}

// Four-band system per IEC 62305-1 / CIGRE TB 858 (AHI_safety thresholds)
export const HEALTH_BAND_HEX = {
  hijau:   '#22C55E',  // ≥ 0.85
  oranye:  '#FB923C',  // 0.70–0.85
  merah:   '#EF4444',  // 0.50–0.70
  ungu:    '#9333EA',  // < 0.50
  neutral: '#9CA3AF',
}

export const HEALTH_BAND_LABEL = {
  hijau: 'Baik', oranye: 'Waspada', merah: 'Bahaya', ungu: 'Kritis', neutral: 'Belum Ada Data',
}

export const scoreToBand = (score) => {
  if (score === null || score === undefined) return 'neutral'
  if (score >= 0.85) return 'hijau'
  if (score >= 0.70) return 'oranye'
  if (score >= 0.50) return 'merah'
  return 'ungu'
}

export const getUrgencyStatus = (iui) => {
  if (iui === null || iui === undefined) return STATUS_COLORS.neutral
  if (iui < 35) return STATUS_COLORS.aman
  if (iui < 65) return STATUS_COLORS.waspada
  return STATUS_COLORS.bahaya
}

export const getHealthStatusKey = (score) => {
  if (score === null || score === undefined) return 'neutral'
  if (score > 0.7) return 'aman'
  if (score >= 0.4) return 'waspada'
  return 'bahaya'
}

// Absolute kA magnitude classification — label layer mirroring backend
// fuzzy_config.MAGNITUDE_KA_BANDS (validasi pakar + CIGRE TB 549 median ~31 kA).
// This is a display/context layer only; it does NOT touch the stress-ratio physics.
export const DAMAGE_ONSET_KA = 30            // kerusakan umumnya > 30 kA (poin 3)
export const MAGNITUDE_REF = { min: 3, max: 150, prob: 0.98 } // 3–150 kA = 98% sambaran (poin 1)

const MAGNITUDE_BANDS = [
  { key: 'kecil',        label: 'Kecil',        color: '#22C55E', min: 0,  max: 10 },
  { key: 'sedang_kecil', label: 'Sedang Kecil', color: '#FDE047', min: 10, max: 30 },
  { key: 'sedang',       label: 'Sedang',       color: '#FB923C', min: 30, max: 50 },
  { key: 'besar',        label: 'Besar',        color: '#EF4444', min: 50, max: Infinity },
]

export const classifyMagnitudeKa = (ipeak) => {
  const v = Number(ipeak)
  if (ipeak === null || ipeak === undefined || Number.isNaN(v)) {
    return { key: 'neutral', label: '—', color: '#9CA3AF' }
  }
  const band = MAGNITUDE_BANDS.find((b) => v >= b.min && v < b.max) || MAGNITUDE_BANDS[MAGNITUDE_BANDS.length - 1]
  return { key: band.key, label: band.label, color: band.color }
}

export const LPL_LABELS = {
  'I':   'LPL I (200 kA)',
  'II':  'LPL II (150 kA)',
  'III': 'LPL III (100 kA)',
  'IV':  'LPL IV (100 kA)',
}

export const LPL_CAPACITY = { I: 200, II: 150, III: 100, IV: 100 }

export const COMPONENT_OPTIONS = {
  air_terminal: [
    { value: 'OK', label: 'OK' },
    { value: 'Rusak', label: 'Rusak' },
    { value: 'Meleleh', label: 'Meleleh' },
    { value: 'Terkorosi', label: 'Terkorosi' },
  ],
  down_conductor: [
    { value: 'OK', label: 'OK' },
    { value: 'Klem_Lepas', label: 'Klem Lepas' },
    { value: 'Bengkok', label: 'Bengkok' },
    { value: 'Putus', label: 'Putus' },
    { value: 'TK_Rusak', label: 'Termination Kit Rusak' },
  ],
  grounding: [
    { value: 'OK', label: 'OK' },
    { value: 'High_Resistance', label: 'High Resistance' },
    { value: 'Terkorosi', label: 'Terkorosi' },
  ],
  spd: [
    { value: 'OK', label: 'OK' },
    { value: 'Degraded', label: 'Degraded' },
    { value: 'Failed', label: 'Failed' },
  ],
  bonding: [
    { value: '', label: 'Tidak Diperiksa' },
    { value: 'OK', label: 'OK' },
    { value: 'Longgar', label: 'Longgar' },
    { value: 'Terputus', label: 'Terputus' },
  ],
  kabel: [
    { value: '', label: 'Tidak Diperiksa' },
    { value: 'OK', label: 'OK' },
    { value: 'Terkelupas', label: 'Terkelupas' },
    { value: 'Terbakar', label: 'Terbakar' },
  ],
}

export const URGENCY_ACTIONS = {
  'Inspeksi Rutin': 'Jadwalkan inspeksi pada siklus berikutnya.',
  'Inspeksi Prioritas': 'Lakukan inspeksi dalam 7 hari. Tugaskan teknisi.',
  'Inspeksi Darurat': 'Inspeksi dalam 24 jam. Pertimbangkan shutdown sementara.',
}

export const URGENCY_COLORS = {
  'Inspeksi Rutin': STATUS_COLORS.aman,
  'Inspeksi Prioritas': STATUS_COLORS.waspada,
  'Inspeksi Darurat': STATUS_COLORS.bahaya,
}

export const VERIFICATION_STATUS = {
  verified:           { bg: 'bg-green-50 ring-green-200 text-green-700', dot: 'bg-green-500', label: 'Terverifikasi' },
  revision_requested: { bg: 'bg-amber-50 ring-amber-200 text-amber-700', dot: 'bg-amber-500', label: 'Revisi Diminta' },
  pending:            { bg: 'bg-gray-50 ring-gray-200 text-gray-600',    dot: 'bg-gray-400',  label: 'Belum Diverifikasi' },
}

export const timeAgo = (iso) => {
  if (!iso) return '—'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return 'baru saja'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m lalu`
  if (diff < 86400) return `${Math.floor(diff / 3600)}j lalu`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}h lalu`
  return formatDate(iso)
}

export const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Jakarta',
  })
}

export const formatDateTime = (dateStr) => {
  if (!dateStr) return '—'
  const formatted = new Date(dateStr).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  })
  return `${formatted} WIB`
}

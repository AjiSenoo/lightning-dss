// Step definitions for the first-run interactive spotlight tour.
//
// Each step targets a DOM element via `tourId`, which must match a
// `data-tour="<tourId>"` attribute rendered in the app (see Layout.jsx).
// Steps with `tourId: null` are centered messages with no highlight.
// `placement` hints where the tooltip sits relative to the target
// ('right' | 'bottom' | 'left' | 'center').

const BASE_STEPS = [
  {
    tourId: null,
    title: 'Selamat datang di Lightning DSS ⚡',
    body: 'Sistem pendukung keputusan proteksi petir (SPP-CBM). Yuk, kenali menu utamanya dalam panduan singkat ini.',
    placement: 'center',
  },
  {
    tourId: 'nav-dashboard',
    title: 'Dashboard',
    body: 'Ringkasan kesehatan aset, aset paling kritis, aktivitas terbaru, dan peta sambaran.',
    placement: 'right',
  },
  {
    tourId: 'nav-assets',
    title: 'Portofolio Aset',
    body: 'Kelola dan pantau seluruh aset proteksi petir beserta skor kesehatannya.',
    placement: 'right',
  },
  {
    tourId: 'nav-inspections',
    title: 'Riwayat Inspeksi',
    body: 'Lihat kembali laporan inspeksi komponen yang pernah dibuat.',
    placement: 'right',
  },
  {
    tourId: 'nav-events',
    title: 'Riwayat Sambaran',
    body: 'Daftar kejadian sambaran petir yang tercatat pada sistem.',
    placement: 'right',
  },
  {
    tourId: 'nav-inspections-new',
    title: 'Input Logbook',
    body: 'Catat hasil inspeksi komponen untuk memperbarui skor kesehatan aset.',
    placement: 'right',
  },
  {
    tourId: 'nav-events-new',
    title: 'Input Kejadian',
    body: 'Laporkan sambaran petir dan dapatkan rekomendasi inspeksi otomatis.',
    placement: 'right',
  },
]

const MANAGER_STEPS = [
  {
    tourId: 'nav-users',
    title: 'Manajemen Pengguna',
    body: 'Kelola akun pengguna dalam organisasi Anda (khusus manajer).',
    placement: 'right',
  },
  {
    tourId: 'nav-trash',
    title: 'Tempat Sampah',
    body: 'Pulihkan aset atau laporan yang terhapus (khusus manajer).',
    placement: 'right',
  },
]

const CLOSING_STEPS = [
  {
    tourId: 'help',
    title: 'Butuh panduan lagi?',
    body: 'Klik tombol ini kapan saja untuk membuka kembali panduan ini.',
    placement: 'bottom',
  },
  {
    tourId: null,
    title: 'Panduan selesai 🎉',
    body: 'Anda siap memulai. Coba catat sambaran petir atau isi logbook inspeksi pertama Anda.',
    placement: 'center',
  },
]

/**
 * Build the ordered tour steps, inserting manager-only steps when relevant.
 * Mirrors the nav composition in Layout.jsx.
 */
export function buildTourSteps({ isManager } = {}) {
  return [
    ...BASE_STEPS,
    ...(isManager ? MANAGER_STEPS : []),
    ...CLOSING_STEPS,
  ]
}

export default buildTourSteps

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

// ---------------------------------------------------------------------------
// Page-level task tours. Target ids match `data-tour="..."` attributes added
// to the form fields on EventInput.jsx and LogbookForm.jsx.
// ---------------------------------------------------------------------------

export function buildEventTour() {
  return [
    {
      tourId: null,
      title: 'Mencatat sambaran petir ⚡',
      body: 'Panduan singkat mengisi kejadian sambaran dan membaca rekomendasinya.',
      placement: 'center',
    },
    {
      tourId: 'event-asset',
      title: '1. Pilih aset',
      body: 'Pilih gedung/fasilitas yang tersambar. Kapasitas desain dan skor kesehatannya akan muncul.',
      placement: 'bottom',
    },
    {
      tourId: 'event-ipeak',
      title: '2. Arus puncak (kA)',
      body: 'Masukkan nilai arus puncak sambaran. Kategori magnitudo dan rasio stres dihitung otomatis.',
      placement: 'bottom',
    },
    {
      tourId: 'event-waktu',
      title: 'Waktu kejadian',
      body: 'Isi tanggal & jam sambaran terjadi (default: waktu sekarang).',
      placement: 'bottom',
    },
    {
      tourId: 'event-submit',
      title: 'Analisis & simpan',
      body: 'Klik untuk menjalankan analisis fuzzy dan menyimpan kejadian.',
      placement: 'bottom',
    },
    {
      tourId: null,
      title: 'Membaca hasil',
      body: 'Setelah disimpan, Anda melihat Tingkat Urgensi, Skor IUI, dan Rekomendasi Tindakan. Dari sana bisa langsung "Buat Tiket Inspeksi".',
      placement: 'center',
    },
  ]
}

export function buildLogbookTour() {
  return [
    {
      tourId: null,
      title: 'Mengisi logbook inspeksi 📋',
      body: 'Panduan singkat mencatat kondisi komponen LPS dan memperbarui skor kesehatan aset.',
      placement: 'center',
    },
    {
      tourId: 'logbook-asset',
      title: 'Pilih aset & waktu',
      body: 'Pilih aset yang diinspeksi dan isi tanggal & waktu inspeksi.',
      placement: 'bottom',
    },
    {
      tourId: 'logbook-ext',
      title: 'LPS Eksternal',
      body: 'Nilai kondisi Air Terminal, Down Conductor, dan Grounding (IEC 62305-3). Semua wajib diisi.',
      placement: 'bottom',
    },
    {
      tourId: 'logbook-int',
      title: 'LPS Internal',
      body: 'Nilai kondisi SPD/Arester, Bonding, dan Shielding (IEC 62305-4). Semua wajib diisi.',
      placement: 'bottom',
    },
    {
      tourId: 'logbook-photo',
      title: 'Foto bukti',
      body: 'Unggah foto bukti. Wajib bila ada komponen yang kondisinya bukan "OK".',
      placement: 'bottom',
    },
    {
      tourId: 'logbook-submit',
      title: 'Simpan logbook',
      body: 'Simpan untuk memperbarui skor kesehatan. Anda akan melihat perbandingan skor sebelum → sesudah.',
      placement: 'bottom',
    },
  ]
}

export default buildTourSteps

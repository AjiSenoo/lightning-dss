import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HEALTH_BAND_HEX, HEALTH_BAND_LABEL } from '../utils/constants'

// Static, referenceable "how to use the system" guide (Bahasa Indonesia).
// Text-based on purpose: durable against form changes, unlike the interactive tours.

function Section({ icon, title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <span className="font-semibold text-gray-800">{title}</span>
        </span>
        <span className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="mt-4 text-sm text-gray-600 leading-relaxed space-y-3">{children}</div>}
    </div>
  )
}

function Steps({ items }) {
  return (
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-brand-50 text-brand-700 text-xs font-bold flex items-center justify-center">
            {i + 1}
          </span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  )
}

function TryLink({ to, children }) {
  const navigate = useNavigate()
  return (
    <button onClick={() => navigate(to)} className="text-brand-700 font-medium hover:underline">
      {children} →
    </button>
  )
}

const HEALTH_BANDS = [
  { band: 'hijau', range: '≥ 85%' },
  { band: 'oranye', range: '70–85%' },
  { band: 'merah', range: '50–70%' },
  { band: 'ungu', range: '< 50%' },
]

export default function Panduan() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">📖 Panduan Penggunaan</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cara memakai Lightning DSS (SPP-CBM) — dari masuk hingga membaca rekomendasi.
          Butuh panduan menu? Klik tombol <strong>?</strong> di kanan atas kapan saja.
        </p>
      </div>

      <Section icon="🚪" title="Memulai — Masuk & Navigasi" defaultOpen>
        <Steps
          items={[
            'Buka aplikasi, masukkan Username dan Password, lalu klik "Masuk".',
            'Untuk mencoba, tersedia akun demo pada halaman login (mis. teknisi / teknisi123, manager / manager123).',
            'Setelah masuk, Anda berada di Dashboard: ringkasan kesehatan aset, aset kritis, aktivitas terbaru, dan peta sambaran.',
          ]}
        />
        <p>
          Menu utama ada di sidebar kiri: <strong>Dashboard</strong>, <strong>Portofolio Aset</strong>,{' '}
          <strong>Riwayat Inspeksi</strong>, <strong>Riwayat Sambaran</strong>,{' '}
          <strong>Input Logbook</strong>, dan <strong>Input Kejadian</strong>. Manajer juga melihat{' '}
          <strong>Manajemen Pengguna</strong> dan <strong>Tempat Sampah</strong>.
        </p>
        <p>
          Di bilah atas terdapat tombol <strong>?</strong> (panduan menu), lonceng notifikasi, dan
          indikator sinkronisasi. Jika koneksi terputus, muncul banner <strong>Mode Offline</strong> —
          data tetap bisa diisi dan akan disinkronkan otomatis saat kembali online.
        </p>
      </Section>

      <Section icon="🏗️" title="Membuat Aset (khusus Manajer)">
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Hanya <strong>Manajer</strong> yang dapat membuat aset. Teknisi tidak melihat tombol ini.
        </p>
        <Steps
          items={[
            'Buka menu "Portofolio Aset", lalu klik "+ Aset Baru".',
            'Isi Nama Gedung (mis. Kilang Balongan - Unit Distilasi).',
            'Isi Lokasi GPS dengan format "lat, lng" (mis. -6.3413, 108.3476).',
            'Pilih LPL Grade (I–IV) sesuai tingkat proteksi petir.',
            'Isi Tanggal Instalasi. Resistivitas Tanah, Material Konduktor, dan Catatan bersifat opsional.',
            'Klik "Tambah Aset". Aset baru langsung muncul di portofolio.',
          ]}
        />
        <TryLink to="/assets">Buka Portofolio Aset</TryLink>
      </Section>

      <Section icon="⚡" title="Mencatat Sambaran Petir">
        <Steps
          items={[
            'Buka "Input Kejadian" (atau tombol "Catat Sambaran Petir" di Dashboard).',
            '1. Pilih aset yang tersambar — kapasitas desain & skor kesehatan akan tampil.',
            '2. Masukkan Arus Puncak (kA); kategori magnitudo dan rasio stres dihitung otomatis. Isi juga Waktu Kejadian.',
            '3. Tambahkan Catatan bila perlu, lalu klik "Analisis & Simpan".',
            'Baca hasilnya: Tingkat Urgensi, Skor IUI, dan Rekomendasi Tindakan.',
            'Bila perlu ditindaklanjuti, klik "Buat Tiket Inspeksi" untuk langsung mengisi logbook.',
          ]}
        />
        <p className="text-xs text-gray-500">
          Tip: di halaman Input Kejadian ada tombol <strong>?</strong> yang menampilkan panduan
          langkah interaktif langsung pada form.
        </p>
        <TryLink to="/events/new">Coba di halaman Input Kejadian</TryLink>
      </Section>

      <Section icon="📋" title="Mengisi Logbook Inspeksi">
        <Steps
          items={[
            'Buka "Input Logbook" (atau tombol "Isi Logbook Inspeksi" di Dashboard).',
            'Pilih aset yang diinspeksi dan isi Tanggal & Waktu Inspeksi.',
            'LPS Eksternal (IEC 62305-3): nilai kondisi Air Terminal, Down Conductor, dan Grounding. Isi Resistansi Grounding bila diukur.',
            'LPS Internal (IEC 62305-4): nilai kondisi SPD/Arester, Bonding, dan Shielding. Keenam komponen wajib diisi.',
            'Bila ada komponen yang kondisinya bukan "OK", unggah minimal satu foto bukti.',
            'Klik "Simpan Logbook Inspeksi". Skor kesehatan aset diperbarui — Anda melihat perbandingan sebelum → sesudah.',
          ]}
        />
        <p className="text-xs text-gray-500">
          Tip: tombol <strong>?</strong> di halaman Input Logbook memandu setiap bagian secara
          interaktif.
        </p>
        <TryLink to="/inspections/new">Coba di halaman Input Logbook</TryLink>
      </Section>

      <Section icon="🧭" title="Membaca Rekomendasi & Skor Kesehatan">
        <p>
          <strong>Tingkat Urgensi</strong> dari analisis sambaran menentukan tindakan:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Inspeksi Rutin</strong> — jadwalkan pada siklus berikutnya.</li>
          <li><strong>Inspeksi Prioritas</strong> — lakukan dalam 7 hari, tugaskan teknisi.</li>
          <li><strong>Inspeksi Darurat</strong> — inspeksi dalam 24 jam, pertimbangkan shutdown sementara.</li>
        </ul>
        <p className="pt-1">
          <strong>Skor Kesehatan Aset (AHI)</strong> dikelompokkan menjadi band warna:
        </p>
        <div className="flex flex-wrap gap-2">
          {HEALTH_BANDS.map(({ band, range }) => (
            <span
              key={band}
              className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full"
              style={{ backgroundColor: `${HEALTH_BAND_HEX[band]}22`, color: HEALTH_BAND_HEX[band] }}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: HEALTH_BAND_HEX[band] }} />
              {HEALTH_BAND_LABEL[band]} ({range})
            </span>
          ))}
        </div>
        <p className="pt-1">
          Skor dihitung per komponen (AT, DC, GR, SPD, BND, SHD) lalu digabung. Detail per komponen
          bisa dilihat pada halaman detail aset.
        </p>
      </Section>
    </div>
  )
}

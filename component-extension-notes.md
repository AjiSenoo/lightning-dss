# Catatan Ekstensi Rantai Komponen LPS — Siap Pakai untuk Laporan TA

Dokumen ini merangkum setiap keputusan desain baru (nilai, bobot, ambang batas) beserta
justifikasi standarnya, siap dipindahkan ke **Bab I** dan **Bab IV** Laporan TA setelah
pembimbing menyetujui pendekatan ini.

---

## 1. Perubahan Lingkup (untuk Bab I — Batasan Masalah)

### Versi lama (eksklusif LPS Eksternal)
> "Ruang lingkup pemantauan kondisi fisik difokuskan eksklusif pada tiga komponen utama
> Sistem Proteksi Petir (SPP) eksternal, yaitu *Air Terminal*, *Down Conductor*, dan
> *Grounding System*... Komponen LPS internal (mis. *equipotential bonding* dan *Surge
> Protection Device*) dikecualikan karena fungsinya sekunder terhadap jalur penyaluran utama
> dan sudah mendapat skema pemeliharaan terpisah pada praktik industri."

### Versi baru (rantai penuh hingga peralatan terproteksi)
Sistem kini memodelkan jalur proteksi lengkap sesuai IEC 62305 dalam satu rantai seri
fungsional:

**AT → DC → GR → BND → SPD → EQP**

di mana:
- **AT, DC, GR** — LPS Eksternal (IEC 62305-3:2010 Klausul 5)
- **BND** (Equipotential Bonding) — LPS Internal, ikatan ekuipotensial (IEC 62305-4:2010
  Klausul 5.4)
- **SPD** (Surge Protective Device) — LPS Internal, perangkat proteksi surja (IEC 62305-4
  Klausul 5.3; IEC 61643-11)
- **EQP** (Protected Equipment) — simpul terminal (titik akhir rantai); dimodelkan sebagai
  *boundary marker* dengan AHI tetap 1,0 dan bobot 0 — jujur bahwa komponen ini bukan
  elemen yang terdegradasi akibat petir, melainkan penanda bahwa sistem proteksi telah
  mencakup hingga peralatan yang dilindungi.

**Batasan Masalah yang diperbarui (ganti poin 1 dan paragraf pengecualian):**
> "Ruang lingkup pemantauan kondisi fisik mencakup rantai fungsional sistem proteksi petir
> secara lengkap, meliputi komponen LPS Eksternal (*Air Terminal*, *Down Conductor*,
> *Grounding Electrode*) maupun LPS Internal (*Equipotential Bonding* dan *Surge Protective
> Device*), serta simpul terminal *Protected Equipment* sebagai penanda akhir rantai proteksi.
> Pemilihan ini mengacu pada IEC 62305-3:2010 Klausul 5 (LPS Eksternal) dan IEC 62305-4:2010
> Klausul 5 (LPS Internal) yang bersama-sama mendefinisikan jalur lengkap penangkap,
> penyalur, pelepas, dan peredaman surja arus petir hingga peralatan terproteksi."

---

## 2. Nilai Desain Baru (untuk Bab IV — Perancangan Sistem)

### 2.1 Eksponen Kerusakan per Komponen

| Komponen | Eksponen | Dasar Standar |
|----------|----------|---------------|
| AT  | 1,0 (linear) | Proksi Q_long; IEC 62305-1 Annex D Tabel 3 |
| DC  | 2,0 (kuadratik) | W/R ∝ I²; IEC 62305-1 Annex D |
| GR  | 1,0 (linear) | Ionisasi tanah pada puncak I; IEC 62305-1 Annex D |
| BND | 1,0 (linear) | Keausan ohmik/mekanis sambungan ~ linear terhadap I; IEC 62305-3 Klausul 5 |
| SPD | 2,0 (kuadratik) | Energi yang diserap MOV ∝ I²·t; IEC 61643-12 Klausul 8 |

### 2.2 Bobot Komponen dalam AHI Keseluruhan

| Komponen | Bobot | Justifikasi |
|----------|-------|-------------|
| AT  | 0,22 | LPS Eksternal, jalur primer — tetap dominan |
| DC  | 0,22 | LPS Eksternal, jalur primer |
| GR  | 0,28 | LPS Eksternal, terberat: mode kegagalan paling sering di tanah tropis Indonesia (IEC 62305-2 loss type R1; SNI 03-7015-2004 prioritas inspeksi) |
| BND | 0,12 | LPS Internal; konduktor bonding lebih tahan lama dari SPD |
| SPD | 0,16 | LPS Internal; elemen sacrificial, penuaan lebih cepat (IEC 61643-12) — lebih besar dari BND |
| EQP | 0,00 | Simpul terminal — dikecualikan dari perhitungan kesehatan |
| **Total** | **1,00** | |

**Catatan jujur untuk Bab IV:** Bobot di atas merupakan estimasi rekayasa yang mengacu pada
prioritas inspeksi SNI 03-7015-2004 dan panduan CIGRE TB 858 ("choose to suit the
application"). Formalisasi dengan Analytic Hierarchy Process (AHP) tetap direkomendasikan
sebagai pekerjaan lanjutan (sudah tercantum di Bab VII Saran).

### 2.3 Umur Desain per Komponen

| Komponen | Iklim Tropis | Iklim Sedang | Dasar |
|----------|-------------|--------------|-------|
| AT  | 20 tahun | 25 tahun | Asumsi umur aset (nilai existing) |
| DC  | 25 tahun | 30 tahun | Konduktor Cu/Al; kegagalan utama mekanis (nilai existing) |
| GR  | 33 tahun | 40 tahun | NBS 45-yr study Cu-clad steel (nilai existing) |
| BND | 25 tahun | 30 tahun | Konduktor bonding Cu; IEC 62305-3 Annex E; setara DC |
| SPD | 8 tahun  | 10 tahun | Perangkat sacrificial MOV; panduan pabrikan + IEC 61643-12 Klausul 9.2; iklim tropis mempercepat degradasi oksida logam |

**Catatan:** Profil iklim dipilih via variabel lingkungan `SITE_CLIMATE_PROFILE`.

### 2.4 Status Hard-Fail (Kegagalan Fungsional)

| Komponen | Status Hard-Fail | Dasar |
|----------|-----------------|-------|
| AT  | Meleleh, Rusak | IEC 62305-3 Klausul 7 — trigger penggantian |
| DC  | Putus | Rantai seri terbuka |
| GR  | High_Resistance | >5 Ω — SNI 03-7015:2004 Pasal 6.5.7 / PUIL 2011 |
| BND | Terputus | Konduktor bonding terbuka — IEC 62305-3 Klausul 5.4 |
| SPD | Failed | MOV rusak total — IEC 61643-11 Klausul 7 |

### 2.5 Ambang Batas Numerik Baru

**Arus Bocor SPD (`SPD_LEAKAGE_REPLACE_THRESHOLD_MA` = 1,0 mA)**
- Dasar: IEC 61643-11 Klausul 7.7 — arus bocor resistif yang meningkat merupakan
  indikator akhir masa pakai MOV; IEC 61643-12 Klausul 8.2 menetapkan prosedur
  pengukuran di lapangan.
- 1,0 mA adalah batas konservatif yang umum digunakan di lapangan (estimasi rekayasa —
  verifikasi terhadap datasheet perangkat yang terpasang).
- Dapat dikonfigurasi via variabel lingkungan `SPD_LEAKAGE_THRESHOLD_MA`.

---

## 3. Perubahan Framing di UI (untuk Bab V — Implementasi)

- Label "Komponen Tambahan" di formulir inspeksi dan detail laporan diganti menjadi
  "LPS Internal" dan "LPS Eksternal" sesuai terminologi IEC 62305.
- EQP ditampilkan sebagai penanda terminal ("Ujung Rantai") di panel kondisi komponen —
  bukan gauge degradasi.
- Status BND dan SPD kini memicu peringatan non-OK (pita oranye) di formulir inspeksi,
  setara dengan AT/DC/GR.

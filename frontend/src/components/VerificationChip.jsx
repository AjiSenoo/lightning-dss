import { VERIFICATION_STATUS } from '../utils/constants'

export default function VerificationChip({ status, editedAfter = false }) {
  const s = VERIFICATION_STATUS[status] || VERIFICATION_STATUS.pending
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ring-1 ${s.bg}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        {s.label}
      </span>
      {editedAfter && status === 'verified' && (
        <span
          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ring-1 bg-amber-50 ring-amber-200 text-amber-700"
          title="Laporan diedit setelah diverifikasi — stempel verifikasi tetap berlaku tetapi konten mungkin sudah berubah."
        >
          ⚠ Diedit setelah verifikasi
        </span>
      )}
    </span>
  )
}

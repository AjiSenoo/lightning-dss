import { VERIFICATION_STATUS } from '../utils/constants'

export default function VerificationChip({ status }) {
  const s = VERIFICATION_STATUS[status] || VERIFICATION_STATUS.pending
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ring-1 ${s.bg}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        {s.label}
      </span>
    </span>
  )
}

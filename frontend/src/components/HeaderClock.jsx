import { useState, useEffect } from 'react'

const TZ_LABELS = {
  'Asia/Jakarta':   'WIB',
  'Asia/Pontianak': 'WIB',
  'Asia/Makassar':  'WITA',
  'Asia/Jayapura':  'WIT',
}

function getTzLabel(now) {
  const iana = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (TZ_LABELS[iana]) return TZ_LABELS[iana]
  const part = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')
  return part?.value || ''
}

export default function HeaderClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })

  return (
    <div
      className="hidden md:flex items-baseline gap-1.5 text-xs font-mono tabular-nums text-brand-100"
      title={`Browser timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
    >
      <span>{time}</span>
      <span className="text-[10px] uppercase tracking-wider text-brand-300">{getTzLabel(now)}</span>
    </div>
  )
}

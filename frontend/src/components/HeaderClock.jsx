import { useState, useEffect } from 'react'

export default function HeaderClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Jakarta',
  })

  return (
    <div className="hidden md:flex items-baseline gap-1.5 text-xs font-mono tabular-nums text-brand-100">
      <span>{time}</span>
      <span className="text-[10px] uppercase tracking-wider text-brand-300">WIB (GMT+7)</span>
    </div>
  )
}

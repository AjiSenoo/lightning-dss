import { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'

// Per-page first-run tour state, mirroring the menu-tour pattern in Layout.jsx.
//
// Each page passes a unique `slug` (e.g. 'event', 'logbook'). The tour auto-opens
// once per user per page (tracked in localStorage) and can be replayed via `start()`.
//
//   const { active, start, finish } = usePageTour('event')
//   <button onClick={start}>?</button>
//   <OnboardingTour steps={...} active={active} onFinish={finish} />
//
// `enabled` lets callers suppress the auto-open (e.g. only auto-run the logbook
// tour in 'create' mode, not edit/amend).
export default function usePageTour(slug, { enabled = true } = {}) {
  const { user } = useAuth()
  const [active, setActive] = useState(false)

  const storageKey = user?.id ? `lightning_tour_${slug}_v1_${user.id}` : null

  useEffect(() => {
    if (!enabled || !storageKey) return
    if (!localStorage.getItem(storageKey)) {
      setActive(true)
    }
  }, [enabled, storageKey])

  const start = () => setActive(true)

  const finish = () => {
    setActive(false)
    if (storageKey) localStorage.setItem(storageKey, '1')
  }

  return { active, start, finish }
}

import { useState, useEffect, useCallback } from 'react'

// Lightweight, dependency-free spotlight tour.
//
// Renders a dimmed overlay that highlights the DOM element carrying
// `data-tour="<step.tourId>"` and shows a tooltip card with the step copy.
// Steps whose `tourId` is null are centered messages; steps whose target
// element can't be found are skipped automatically.

const PAD = 6 // px of breathing room around the highlighted element

function getTargetRect(tourId) {
  if (!tourId) return null
  const el = document.querySelector(`[data-tour="${tourId}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

function computeTooltipStyle(rect, placement) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(320, vw - 24)
  const isMobile = vw < 768

  // Centered step, missing target, or small screen → anchor at a safe spot.
  if (!rect || placement === 'center') {
    return { width, left: (vw - width) / 2, top: Math.max(24, vh / 2 - 120) }
  }
  if (isMobile) {
    // Sidebar takes the left edge on mobile; park the card at the bottom.
    return { width, left: (vw - width) / 2, bottom: 20 }
  }

  let left
  let top
  if (placement === 'bottom') {
    top = rect.top + rect.height + 12
    left = rect.left
  } else if (placement === 'left') {
    top = rect.top
    left = rect.left - width - 12
  } else {
    // default: 'right'
    top = rect.top
    left = rect.left + rect.width + 12
  }

  // Keep the card inside the viewport.
  left = Math.max(12, Math.min(left, vw - width - 12))
  top = Math.max(12, Math.min(top, vh - 220))
  return { width, left, top }
}

export default function OnboardingTour({ steps = [], active, onFinish, onStepChange }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState(null)

  const total = steps.length
  const step = steps[stepIndex]

  const finish = useCallback(() => {
    onFinish?.()
  }, [onFinish])

  const goNext = useCallback(() => {
    setStepIndex((i) => {
      if (i >= total - 1) {
        finish()
        return i
      }
      return i + 1
    })
  }, [total, finish])

  const goBack = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1))
  }, [])

  // Restart from the top each time the tour opens.
  useEffect(() => {
    if (active) setStepIndex(0)
  }, [active])

  // Measure the current target (with retries for CSS transitions such as the
  // mobile sidebar sliding in), and skip the step if the target never appears.
  useEffect(() => {
    if (!active || !step) return
    onStepChange?.(step, stepIndex)

    const measure = () => setRect(getTargetRect(step.tourId))
    measure()
    const raf = requestAnimationFrame(measure)
    const t1 = setTimeout(measure, 130)
    const t2 = setTimeout(measure, 290)
    const skipTimer = setTimeout(() => {
      if (step.tourId && !document.querySelector(`[data-tour="${step.tourId}"]`)) {
        goNext()
      }
    }, 340)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(skipTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex, steps])

  // Follow the target on scroll/resize.
  useEffect(() => {
    if (!active || !step) return
    const onMove = () => setRect(getTargetRect(step.tourId))
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [active, step])

  // Keyboard shortcuts.
  useEffect(() => {
    if (!active) return
    const onKey = (e) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, finish, goNext, goBack])

  if (!active || !step) return null

  const tooltipStyle = computeTooltipStyle(rect, step.placement)
  const isFirst = stepIndex === 0
  const isLast = stepIndex === total - 1

  return (
    <div className="fixed inset-0 z-[9998]" style={{ pointerEvents: 'auto' }}>
      {/* Dim + spotlight */}
      {rect ? (
        <div
          style={{
            position: 'fixed',
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
            border: '2px solid rgba(251, 191, 36, 0.9)',
            transition: 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease',
            pointerEvents: 'none',
          }}
        />
      ) : (
        <div className="fixed inset-0" style={{ background: 'rgba(15, 23, 42, 0.55)' }} />
      )}

      {/* Tooltip card */}
      <div
        className="fixed rounded-2xl bg-white shadow-2xl border border-gray-100 p-5 animate-fade-in"
        style={{ ...tooltipStyle, pointerEvents: 'auto' }}
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">
            Langkah {stepIndex + 1}/{total}
          </span>
          <div className="flex items-center gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIndex ? 'w-4 bg-brand-600' : 'w-1.5 bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>

        <h3 className="text-base font-bold text-gray-900 font-display">{step.title}</h3>
        <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            onClick={finish}
            className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
          >
            Lewati
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={goBack}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Kembali
              </button>
            )}
            <button
              onClick={goNext}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-sm"
            >
              {isLast ? 'Selesai' : 'Lanjut'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

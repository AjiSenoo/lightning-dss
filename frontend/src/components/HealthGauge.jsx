import { getHealthStatus } from '../utils/constants'

export default function HealthGauge({ score, size = 120 }) {
  const pct = Math.max(0, Math.min(1, score ?? 0))
  const color = getHealthStatus(score)

  const radius = (size / 2) - 10
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - pct)

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={10}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color.bg}
          strokeWidth={10}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div
        className="absolute font-bold"
        style={{
          fontSize: size * 0.2,
          color: color.bg,
          marginTop: -(size * 0.6),
        }}
      >
        {Math.round(pct * 100)}%
      </div>
    </div>
  )
}

export function HealthGaugeInline({ score, size = 80 }) {
  const pct = Math.max(0, Math.min(1, score ?? 0))
  const color = getHealthStatus(score)
  const radius = (size / 2) - 8
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - pct)

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#E5E7EB" strokeWidth={8} />
        <circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={color.bg} strokeWidth={8}
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <span
        className="absolute font-bold text-xs"
        style={{ color: color.bg }}
      >
        {Math.round(pct * 100)}%
      </span>
    </div>
  )
}

import { getHealthStatus, getUrgencyStatus } from '../utils/constants'

const SIZE = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3.5 py-1.5 text-sm',
}

const DOT = {
  sm: 'w-1 h-1',
  md: 'w-1.5 h-1.5',
  lg: 'w-2 h-2',
}

export default function StatusBadge({ type = 'health', value, size = 'md', className = '' }) {
  const color = type === 'urgency' ? getUrgencyStatus(value) : getHealthStatus(value)

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${SIZE[size]} ${className}`}
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      <span className={`${DOT[size]} rounded-full bg-current opacity-90`} />
      {color.label}
    </span>
  )
}

const URGENCY_COLOR = {
  'Inspeksi Rutin': { bg: '#dcfce7', text: '#15803d', dot: '#22c55e' },
  'Inspeksi Prioritas': { bg: '#fef3c7', text: '#a16207', dot: '#f59e0b' },
  'Inspeksi Darurat': { bg: '#fee2e2', text: '#b91c1c', dot: '#ef4444' },
}

export function UrgencyBadge({ label, size = 'md' }) {
  const color = URGENCY_COLOR[label] || { bg: '#f3f4f6', text: '#4b5563', dot: '#9ca3af' }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${SIZE[size]}`}
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      <span className={`${DOT[size]} rounded-full`} style={{ backgroundColor: color.dot }} />
      {label || 'Belum Ada Data'}
    </span>
  )
}

const ROLE_STYLE = {
  Manajer: 'bg-purple-100 text-purple-700',
  Teknisi: 'bg-blue-100 text-blue-700',
}

export function RoleBadge({ role, size = 'md' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${SIZE[size]} ${ROLE_STYLE[role] || 'bg-gray-100 text-gray-700'}`}>
      {role}
    </span>
  )
}

export function ComponentBadge({ label, value, size = 'sm' }) {
  const ok = value === 'OK'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${SIZE[size]} ${
      ok ? 'bg-green-50 text-green-700 ring-1 ring-green-100' : 'bg-red-50 text-red-700 ring-1 ring-red-100'
    }`}>
      <span className="font-semibold">{label}</span>
      <span className="opacity-70">·</span>
      <span>{value || '—'}</span>
    </span>
  )
}

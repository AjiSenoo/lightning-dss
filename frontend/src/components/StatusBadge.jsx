import { getHealthStatus, getUrgencyStatus } from '../utils/constants'

export default function StatusBadge({ type = 'health', value, size = 'md', className = '' }) {
  const color = type === 'urgency' ? getUrgencyStatus(value) : getHealthStatus(value)

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base',
  }

  return (
    <span
      className={`inline-block rounded-full font-semibold ${sizeClasses[size]} ${className}`}
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {color.label}
    </span>
  )
}

export function UrgencyBadge({ label, size = 'md' }) {
  const colorMap = {
    'Inspeksi Rutin': { bg: '#22C55E', text: '#fff' },
    'Inspeksi Prioritas': { bg: '#F59E0B', text: '#000' },
    'Inspeksi Darurat': { bg: '#EF4444', text: '#fff' },
  }
  const color = colorMap[label] || { bg: '#6B7280', text: '#fff' }
  const sizeClasses = { sm: 'px-2 py-0.5 text-xs', md: 'px-3 py-1 text-sm', lg: 'px-4 py-2 text-base' }

  return (
    <span
      className={`inline-block rounded-full font-semibold ${sizeClasses[size]}`}
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {label || 'Belum Ada Data'}
    </span>
  )
}

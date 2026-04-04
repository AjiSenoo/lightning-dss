import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { formatDate } from '../utils/constants'

const URGENCY_COLORS = {
  'Inspeksi Rutin': '#22C55E',
  'Inspeksi Prioritas': '#F59E0B',
  'Inspeksi Darurat': '#EF4444',
}

export default function StrikeChart({ events = [] }) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        Belum ada data sambaran
      </div>
    )
  }

  const data = [...events]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-20)
    .map((e) => ({
      date: formatDate(e.timestamp),
      ipeak: e.estimasi_arus_puncak_ka,
      label: e.fuzzy_output_label,
      color: URGENCY_COLORS[e.fuzzy_output_label] || '#6B7280',
    }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10 }}
          angle={-30}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fontSize: 11 }} unit=" kA" />
        <Tooltip
          formatter={(val, name) => [`${val} kA`, 'Ipeak']}
          labelFormatter={(label) => `Tanggal: ${label}`}
        />
        <Bar dataKey="ipeak" radius={[3, 3, 0, 0]}>
          {data.map((entry, idx) => (
            <Cell key={idx} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

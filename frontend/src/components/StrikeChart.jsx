import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { formatDate } from '../utils/constants'

const URGENCY_COLORS = {
  'Inspeksi Rutin':      '#22C55E',
  'Inspeksi Prioritas':  '#F59E0B',
  'Inspeksi Darurat':    '#EF4444',
}

function CustomDot({ cx, cy, payload }) {
  const color = payload.color || '#6B7280'
  return <circle cx={cx} cy={cy} r={5} fill={color} fillOpacity={0.85} stroke="#fff" strokeWidth={1} />
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs space-y-0.5">
      <p className="font-semibold text-gray-800">{formatDate(new Date(p.ts))}</p>
      <p className="text-gray-600">{p.ipeak} kA</p>
      {p.label && <p style={{ color: p.color }}>{p.label}</p>}
    </div>
  )
}

export default function StrikeChart({ events = [], kapasitasKa }) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        Belum ada data sambaran
      </div>
    )
  }

  const data = [...events]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map((e) => ({
      ts:    new Date(e.timestamp).getTime(),
      ipeak: e.estimasi_arus_puncak_ka,
      label: e.fuzzy_output_label,
      color: URGENCY_COLORS[e.fuzzy_output_label] || '#6B7280',
    }))

  const tMin = data[0].ts
  const tMax = data[data.length - 1].ts
  const pad  = Math.max((tMax - tMin) * 0.05, 86400000)

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis
          type="number"
          dataKey="ts"
          domain={[tMin - pad, tMax + pad]}
          tickFormatter={(t) => formatDate(new Date(t))}
          tick={{ fontSize: 10 }}
          angle={-25}
          textAnchor="end"
          scale="time"
          name="Tanggal"
        />
        <YAxis
          type="number"
          dataKey="ipeak"
          tick={{ fontSize: 11 }}
          unit=" kA"
          name="Arus Puncak"
        />
        <Tooltip content={<CustomTooltip />} />
        {kapasitasKa && (
          <ReferenceLine
            y={kapasitasKa}
            strokeDasharray="4 3"
            stroke="#9CA3AF"
            label={{ value: `Kapasitas ${kapasitasKa} kA`, position: 'insideTopRight', fontSize: 10, fill: '#9CA3AF' }}
          />
        )}
        <Scatter data={data} shape={<CustomDot />}>
          {data.map((entry, idx) => (
            <Cell key={idx} fill={entry.color} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  )
}

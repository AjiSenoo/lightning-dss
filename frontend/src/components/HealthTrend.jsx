import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts'
import { formatDate } from '../utils/constants'

export default function HealthTrend({ inspections = [] }) {
  if (inspections.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        Belum ada data inspeksi
      </div>
    )
  }

  const data = [...inspections]
    .sort((a, b) => new Date(a.tgl_inspeksi) - new Date(b.tgl_inspeksi))
    .slice(-20)
    .map((i) => ({
      date: formatDate(i.tgl_inspeksi),
      health: i.health_after ?? null,
    }))
    .filter((d) => d.health !== null)

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
        <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
        <Tooltip formatter={(val) => [`${Math.round(val * 100)}%`, 'Skor Kesehatan']} />
        <ReferenceArea y1={0} y2={0.4} fill="#FEE2E2" fillOpacity={0.3} />
        <ReferenceArea y1={0.4} y2={0.7} fill="#FEF3C7" fillOpacity={0.3} />
        <ReferenceArea y1={0.7} y2={1} fill="#DCFCE7" fillOpacity={0.3} />
        <ReferenceLine y={0.7} stroke="#22C55E" strokeDasharray="4 4" />
        <ReferenceLine y={0.4} stroke="#EF4444" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="health"
          stroke="#3B82F6"
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

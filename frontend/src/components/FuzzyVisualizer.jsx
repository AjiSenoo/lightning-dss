import { useState, useEffect } from 'react'
import client from '../api/client'

// Draw a trapezoidal membership function
function Trapezoid({ points, color, universe, width = 300, height = 80 }) {
  const [a, b, c, d] = points
  const [uMin, uMax] = universe

  const toX = (v) => ((v - uMin) / (uMax - uMin)) * width
  const toY = (m) => height - m * height

  const pathD = [
    `M ${toX(a)} ${toY(0)}`,
    `L ${toX(b)} ${toY(1)}`,
    `L ${toX(c)} ${toY(1)}`,
    `L ${toX(d)} ${toY(0)}`,
  ].join(' ')

  return <path d={pathD} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={1.5} />
}

function Triangle({ points, color, universe, width = 300, height = 80 }) {
  const [a, b, c] = points
  const [uMin, uMax] = universe

  const toX = (v) => ((v - uMin) / (uMax - uMin)) * width
  const toY = (m) => height - m * height

  const pathD = [
    `M ${toX(a)} ${toY(0)}`,
    `L ${toX(b)} ${toY(1)}`,
    `L ${toX(c)} ${toY(0)}`,
  ].join(' ')

  return <path d={pathD} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={1.5} />
}

function MFChart({ title, mfs, universe, width = 280, height = 80, currentValue }) {
  const [uMin, uMax] = universe
  const toX = (v) => ((v - uMin) / (uMax - uMin)) * width

  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-1">{title}</p>
      <svg width={width} height={height + 20} className="overflow-visible">
        {/* Axes */}
        <line x1={0} y1={height} x2={width} y2={height} stroke="#D1D5DB" strokeWidth={1} />
        {/* MFs */}
        {mfs.map((mf, i) =>
          mf.type === 'trap' ? (
            <Trapezoid key={i} points={mf.points} color={mf.color} universe={universe} width={width} height={height} />
          ) : (
            <Triangle key={i} points={mf.points} color={mf.color} universe={universe} width={width} height={height} />
          )
        )}
        {/* Labels */}
        {mfs.map((mf, i) => {
          const midX = mf.type === 'trap'
            ? toX((mf.points[1] + mf.points[2]) / 2)
            : toX(mf.points[1])
          return (
            <text key={i} x={midX} y={height - 5} textAnchor="middle" fontSize={9} fill={mf.color} fontWeight="bold">
              {mf.label}
            </text>
          )
        })}
        {/* Current value marker */}
        {currentValue !== undefined && (
          <line
            x1={toX(currentValue)}
            y1={0}
            x2={toX(currentValue)}
            y2={height}
            stroke="#1D4ED8"
            strokeWidth={2}
            strokeDasharray="4 2"
          />
        )}
      </svg>
    </div>
  )
}

export default function FuzzyVisualizer({ rStress, dAsset, iuiScore }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <MFChart
        title="R_stress (Rasio Stres)"
        universe={[0, 1.5]}
        mfs={[
          { type: 'trap', points: [0, 0, 0.2, 0.4], color: '#22C55E', label: 'Rendah' },
          { type: 'tri', points: [0.3, 0.5, 0.7], color: '#F59E0B', label: 'Sedang' },
          { type: 'trap', points: [0.6, 0.8, 1.5, 1.5], color: '#EF4444', label: 'Tinggi' },
        ]}
        currentValue={rStress}
      />
      <MFChart
        title="D_asset (Degradasi Aset)"
        universe={[0, 1]}
        mfs={[
          { type: 'trap', points: [0, 0, 0.15, 0.3], color: '#22C55E', label: 'Prima' },
          { type: 'tri', points: [0.2, 0.4, 0.6], color: '#F59E0B', label: 'Degradasi' },
          { type: 'trap', points: [0.5, 0.7, 1.0, 1.0], color: '#EF4444', label: 'Kritis' },
        ]}
        currentValue={dAsset}
      />
      <MFChart
        title="IUI (Urgensi Inspeksi 0–100)"
        universe={[0, 100]}
        mfs={[
          { type: 'trap', points: [0, 0, 20, 40], color: '#22C55E', label: 'Rutin' },
          { type: 'tri', points: [30, 50, 70], color: '#F59E0B', label: 'Prioritas' },
          { type: 'trap', points: [60, 80, 100, 100], color: '#EF4444', label: 'Darurat' },
        ]}
        currentValue={iuiScore}
      />
    </div>
  )
}

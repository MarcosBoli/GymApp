import { useId } from 'react'
import { divisionPips, emblemGeometry, emblemSpec } from '../../domain/emblem'
import type { Division } from '../../domain/ranking'
import { RANK_CONFIG } from '../../data/ranking'

/**
 * Emblema original y procedural: cada tier añade capas geométricas.
 * `tierIndex` null = sin rango (contorno discontinuo).
 */
export function Emblem({ tierIndex, division, size = 48, className = '' }: { tierIndex: number | null; division?: Division | null; size?: number; className?: string }) {
  const gid = useId()
  if (tierIndex === null) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
        <circle cx="50" cy="50" r="30" fill="none" stroke="#52525b" strokeWidth="3" strokeDasharray="6 6" />
        <text x="50" y="58" textAnchor="middle" fontSize="26" fill="#71717a" fontWeight="700">?</text>
      </svg>
    )
  }
  const color = RANK_CONFIG.tiers[tierIndex]?.color ?? '#888'
  const g = emblemGeometry(emblemSpec(tierIndex))
  const pips = divisionPips(division ?? null)
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      <defs>
        <radialGradient id={gid} cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor={color} stopOpacity="0.55" />
          <stop offset="1" stopColor={color} stopOpacity="0.12" />
        </radialGradient>
      </defs>
      {g.crown && <polygon points={g.crown} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1" strokeLinejoin="round" />}
      {g.rays.map((r, i) => (
        <polygon key={i} points={r} fill={color} fillOpacity="0.85" />
      ))}
      {g.orbit.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill={color} />
      ))}
      <polygon points={g.plate} fill={`url(#${gid})`} stroke={color} strokeWidth="3" strokeLinejoin="round" />
      {g.facets.map(([a, b], i) => (
        <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeOpacity="0.45" strokeWidth="1.2" />
      ))}
      {g.inner && <polygon points={g.inner} fill={color} fillOpacity="0.28" stroke={color} strokeWidth="2" strokeLinejoin="round" />}
      {g.star && <polygon points={g.star} fill={color} stroke="#0a0a0f" strokeWidth="0.8" strokeLinejoin="round" />}
      {!g.star && <circle cx="50" cy="50" r="4" fill={color} />}
      {pips > 0 &&
        Array.from({ length: 4 }, (_, i) => (
          <rect key={i} x={36 + i * 7.5} y="88" width="5.5" height="5" rx="1" fill={i < pips ? color : '#3f3f46'} />
        ))}
    </svg>
  )
}

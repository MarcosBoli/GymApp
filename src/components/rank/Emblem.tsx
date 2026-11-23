import type { EmblemState } from '../../domain/progress'
import { divisionPips, DIVISIONS, type Division } from '../../domain/ranking'
import { RANK_CONFIG } from '../../data/ranking'
import { rankImage } from './rankImages'

interface Props {
  /** null = sin rango (insignia bloqueada). */
  tierIndex: number | null
  /** Con división se pintan los pips (III → 1, II → 2, I → 3). */
  division?: Division | null
  state?: EmblemState
  size?: number
  className?: string
}

const FILTER: Partial<Record<EmblemState, string>> = {
  locked: 'grayscale(1) brightness(0.35)',
  inactive: 'grayscale(0.9) brightness(0.55)',
}

/** En promo, la insignia brilla con el color del rango siguiendo su silueta. */
const promoGlow = (color: string, size: number) => `drop-shadow(0 0 ${Math.max(2, size * 0.05)}px ${color}) drop-shadow(0 0 ${Math.max(4, size * 0.12)}px ${color})`

/**
 * Insignia del tier (imagen) con lo que depende del estado pintado por código encima:
 * pips de división, bloqueada (sin rango), inactiva (+14 días) y en promoción.
 * Decorativa: el rango siempre va también en texto al lado.
 */
export function Emblem({ tierIndex, division, state = 'ranked', size = 48, className = '' }: Props) {
  const locked = tierIndex === null || state === 'locked'
  const visual: EmblemState = locked ? 'locked' : state
  const pips = !locked && division ? divisionPips(division) : 0
  const badge = Math.max(12, Math.round(size * 0.3))
  const glow = tierIndex === null ? '#888' : (RANK_CONFIG.tiers[tierIndex]?.color ?? '#888')

  return (
    <span aria-hidden className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      <img
        src={rankImage(tierIndex ?? 0)}
        alt=""
        draggable={false}
        decoding="async"
        className="absolute inset-x-0 top-0 mx-auto object-contain select-none"
        style={{ width: '100%', height: pips ? '84%' : '100%', filter: visual === 'promo' ? promoGlow(glow, size) : FILTER[visual], opacity: locked ? 0.8 : 1 }}
      />
      {pips > 0 && (
        <svg viewBox="0 0 30 8" className="absolute inset-x-[22%] bottom-0" style={{ height: '14%' }}>
          {DIVISIONS.map((_, i) => (
            <path
              key={i}
              d={`M${5 + i * 10} 0.8 L${8.6 + i * 10} 4 L${5 + i * 10} 7.2 L${1.4 + i * 10} 4 Z`}
              fill={i < pips ? '#f4f4f5' : '#3f3f46'}
              stroke="#0a0a0f"
              strokeWidth="0.8"
            />
          ))}
        </svg>
      )}
      {visual === 'locked' && (
        <svg viewBox="0 0 24 24" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: size * 0.36, height: size * 0.36 }}>
          <rect x="5" y="10.5" width="14" height="10" rx="2" fill="#a1a1aa" />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="#a1a1aa" strokeWidth="2.2" />
        </svg>
      )}
      {visual === 'inactive' && (
        <svg viewBox="0 0 24 24" className="absolute top-0 right-0" style={{ width: badge, height: badge }}>
          <circle cx="12" cy="12" r="11" fill="#fcd34d" stroke="#0a0a0f" strokeWidth="2" />
          <path d="M12 6.5V12l3.5 2.2" fill="none" stroke="#0a0a0f" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      )}
      {visual === 'promo' && (
        <svg viewBox="0 0 24 24" className="absolute top-0 right-0" style={{ width: badge, height: badge }}>
          <circle cx="12" cy="12" r="11" fill="#67e8f9" stroke="#0a0a0f" strokeWidth="2" />
          <path d="M7 14l5-5 5 5" fill="none" stroke="#0a0a0f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

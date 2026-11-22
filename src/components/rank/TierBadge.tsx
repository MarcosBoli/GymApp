import type { Rank } from '../../domain/ranking'
import { formatRank } from '../../domain/ranking'
import { RANK_CONFIG } from '../../data/ranking'

export const tierColor = (rank: Rank) => RANK_CONFIG.tiers[rank.tierIndex]?.color ?? '#888'

/** Emblema del tier: escudo del color del tier + nombre y división. */
export function TierBadge({ rank, size = 'md', showLp = false }: { rank: Rank; size?: 'sm' | 'md' | 'lg'; showLp?: boolean }) {
  const color = tierColor(rank)
  const icon = { sm: 'size-5', md: 'size-7', lg: 'size-14' }[size]
  const text = { sm: 'text-sm', md: 'text-base', lg: 'text-2xl' }[size]
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 24 24" className={icon} aria-hidden>
        <path d="M12 2 20 5v6c0 5.2-3.4 9.4-8 11-4.6-1.6-8-5.8-8-11V5z" fill={color} fillOpacity={0.18} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        <path d="M8.5 10.5 12 13l3.5-2.5" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`${text} font-semibold`} style={{ color }}>
        {formatRank(rank)}
        {showLp && <span className="ml-1.5 font-normal text-zinc-400">{rank.lp} LP</span>}
      </span>
    </span>
  )
}

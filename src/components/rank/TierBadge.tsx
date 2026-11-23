import type { Rank } from '../../domain/ranking'
import { formatRank } from '../../domain/ranking'
import { RANK_CONFIG } from '../../data/ranking'
import { Emblem } from './Emblem'

export const tierColor = (rank: Rank) => RANK_CONFIG.tiers[rank.tierIndex]?.color ?? '#888'

/** Emblema del tier + nombre y división (texto en tinta neutra, el color lo lleva el emblema). */
export function TierBadge({ rank, size = 'md', showLp = false }: { rank: Rank; size?: 'sm' | 'md' | 'lg'; showLp?: boolean }) {
  const px = { sm: 22, md: 30, lg: 56 }[size]
  const text = { sm: 'text-sm', md: 'text-base', lg: 'text-2xl' }[size]
  return (
    <span className="inline-flex items-center gap-2">
      <Emblem tierIndex={rank.tierIndex} size={px} />
      <span className={`${text} font-semibold text-zinc-100`}>
        {formatRank(rank)}
        {showLp && <span className="ml-1.5 font-normal text-zinc-400">{rank.lp} LP</span>}
      </span>
    </span>
  )
}

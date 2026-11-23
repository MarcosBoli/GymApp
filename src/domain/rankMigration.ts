/**
 * Paso de la escalera antigua (9 tiers, divisiones IV-I) a la actual (6 tiers × 3 divisiones).
 * Los rangos guardados en los resúmenes conservan su `score`, así que se recalculan con la
 * config actual. Las promos antiguas apuntan a tiers que ya no existen: se descartan.
 */
import type { WorkoutSummary } from './summary'
import { diffRanks, rankFromScore, type Rank, type RankConfig, type RankSnapshot } from './ranking'
import { RANK_CONFIG } from '../data/ranking'

/** Versión del esquema de Dexie desde la que los rangos guardados usan los 6 tiers. */
export const SIX_TIER_SCHEMA_VERSION = 8

/** Resumen de partida con sus rangos recalculados por score (sin eventos de promo antiguos). */
export function remapSummaryRanks(summary: WorkoutSummary, config: RankConfig = RANK_CONFIG): WorkoutSummary {
  const remap = (r: Rank | null): Rank | null => (r ? rankFromScore(r.score, config) : null)
  const before: RankSnapshot = {}
  const after: RankSnapshot = {}
  for (const d of summary.diffs) {
    before[d.id] = remap(d.before)
    after[d.id] = remap(d.after)
  }
  return { ...summary, diffs: diffRanks(before, after, config), promotions: [] }
}

import { describe, expect, it } from 'vitest'
import type { Rank } from './ranking'
import type { WorkoutSummary } from './summary'
import { remapSummaryRanks } from './rankMigration'

/** Rango tal y como lo guardaba la escalera antigua (9 tiers, divisiones IV-I). */
const old = (tierIndex: number, tierName: string, division: string | null, lp: number, score: number) =>
  ({ tierIndex, tierId: tierName.toLowerCase(), tierName, division, lp, score }) as unknown as Rank

const summary: WorkoutSummary = {
  ranked: true,
  durationMs: 1,
  sets: 1,
  volumeKg: 1,
  diffs: [
    { id: 'global', before: old(3, 'Oro', 'IV', 50, 37.5), after: old(4, 'Platino', 'IV', 0, 48), lpDelta: 150, change: 'promoted' },
    { id: 'chest', before: old(7, 'Maestro', null, 10, 85), after: old(7, 'Maestro', null, 30, 87), lpDelta: 20, change: 'same' },
    { id: 'lats', before: null, after: old(1, 'Bronce', 'III', 0, 15), lpDelta: 0, change: 'new' },
  ],
  promotions: [{ id: 'global', kind: 'started', state: { status: 'promo', tierIndex: 3, targetTierIndex: 4, wins: 0, losses: 0 } }],
  records: [],
} as unknown as WorkoutSummary

describe('remapSummaryRanks', () => {
  const out = remapSummaryRanks(summary)
  const by = Object.fromEntries(out.diffs.map((d) => [d.id, d]))

  it('recalcula cada rango por su score con los 6 tiers', () => {
    expect(by.global!.before).toMatchObject({ tierName: 'Aprendiz', division: 'II', score: 37.5 })
    expect(by.global!.after).toMatchObject({ tierName: 'Atleta', division: 'III', score: 48 })
    expect(by.chest!.before).toMatchObject({ tierName: 'Titán', division: 'III', lp: 75 })
    expect(by.chest!.after).toMatchObject({ tierName: 'Titán', division: 'II', lp: 5 })
    expect(by.lats!.after).toMatchObject({ tierName: 'Novato', division: 'II' })
  })

  it('recalcula cambios y LP con la escalera nueva', () => {
    expect(by.global).toMatchObject({ change: 'promoted' })
    expect(by.chest).toMatchObject({ change: 'division_up', lpDelta: 30 }) // 2 puntos de score en Titán = 30 LP
    expect(by.lats).toMatchObject({ change: 'new', lpDelta: 0 })
  })

  it('descarta las promos antiguas y conserva el resto', () => {
    expect(out.promotions).toEqual([])
    expect(out).toMatchObject({ ranked: true, durationMs: 1, sets: 1, volumeKg: 1, records: [] })
  })

  it('es idempotente', () => {
    expect(remapSummaryRanks(out)).toEqual(out)
  })
})

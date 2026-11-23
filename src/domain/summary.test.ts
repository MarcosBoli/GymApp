import { describe, expect, it } from 'vitest'
import { buildWorkoutSummary, describePromotion, GLOBAL_RANK_ID, type SummaryInput } from './summary'
import { DAY_MS, tierIndexForScore, type PromotionState, type StrengthStandards } from './ranking'
import type { ExerciseMuscle } from './types'

const NOW = Date.UTC(2026, 10, 22, 18)
const START = NOW - 3_600_000

const STD: StrengthStandards = {
  levels: ['p', 'n', 'i', 'a', 'e'],
  levelScores: [10, 30, 50, 75, 100],
  exercises: {
    bench: { male: [0.5, 0.75, 1, 1.5, 2], female: [0.25, 0.5, 0.75, 1, 1.25] },
    squat: { male: [0.75, 1.25, 1.5, 2, 2.5], female: [0.5, 0.75, 1, 1.5, 2] },
  },
}
const EM: ExerciseMuscle[] = [
  { exerciseId: 'bench', muscleId: 'chest', factor: 1 },
  { exerciseId: 'bench', muscleId: 'triceps', factor: 0.5 },
  { exerciseId: 'squat', muscleId: 'quads', factor: 1 },
]
const MUSCLES = ['chest', 'triceps', 'quads']

let n = 0
const set = (workoutId: string, exerciseId: string, weightKg: number, reps: number, performedAt: number, isWarmup = false) => ({
  id: `s${++n}`, workoutId, exerciseId, weightKg, reps, performedAt, isWarmup,
})

function input(over: Partial<SummaryInput> = {}): SummaryInput {
  return {
    workout: { id: 'w2', startedAt: START },
    endedAt: NOW,
    sets: [],
    exerciseMuscles: EM,
    muscleIds: MUSCLES,
    sex: 'male',
    bodyweightKg: 80,
    rankStates: {},
    ...over,
  }
}

const oldSession = Array.from({ length: 10 }, () => set('w1', 'bench', 70, 1, START - 2 * DAY_MS))
const squatOld = Array.from({ length: 10 }, () => set('w1', 'squat', 100, 1, START - 2 * DAY_MS))

describe('describePromotion', () => {
  const stable = (tierIndex: number): PromotionState => ({ status: 'stable', tierIndex })
  const promo = (wins: number, losses: number): PromotionState => ({ status: 'promo', tierIndex: 2, targetTierIndex: 3, wins, losses })

  it.each([
    [undefined, stable(2), null],
    [stable(2), stable(2), null],
    [stable(2), stable(1), 'demoted'],
    [stable(2), promo(0, 0), 'started'],
    [promo(0, 0), promo(1, 0), 'won_game'],
    [promo(1, 0), promo(1, 1), 'lost_game'],
    [promo(1, 0), stable(3), 'promoted'],
    [promo(0, 1), stable(2), 'failed'],
    [promo(0, 1), stable(1), 'failed'],
  ] as const)('%o → %o = %s', (prev, next, kind) => {
    expect(describePromotion(prev, next)).toBe(kind)
  })
})

describe('buildWorkoutSummary', () => {
  it('estadísticas y récords del entreno', () => {
    const today = [set('w2', 'bench', 40, 10, START + 60_000, true), set('w2', 'bench', 80, 5, START + 120_000), set('w2', 'bench', 80, 5, START + 180_000)]
    const { summary } = buildWorkoutSummary(input({ sets: [...oldSession, ...today] }), STD)
    expect(summary).toMatchObject({ durationMs: 3_600_000, workingSets: 2, volumeKg: 800, exerciseCount: 1, ranked: true })
    expect(summary.records).toHaveLength(1)
    expect(summary.records[0]).toMatchObject({ exerciseId: 'bench', weightKg: 80, reps: 5 })
  })

  it('LP por músculo solo de los músculos entrenados + global', () => {
    const today = Array.from({ length: 3 }, (_, i) => set('w2', 'bench', 80, 1, START + i * 60_000))
    const { summary } = buildWorkoutSummary(input({ sets: [...oldSession, ...squatOld, ...today] }), STD)
    const ids = summary.diffs.map((d) => d.id).sort()
    expect(ids).toEqual(['chest', GLOBAL_RANK_ID, 'triceps'])
    const chest = summary.diffs.find((d) => d.id === 'chest')!
    expect(chest.lpDelta).toBeGreaterThan(0)
    expect(chest.before).not.toBeNull()
  })

  it('primer entreno: rangos nuevos (colocación), sin eventos de promo', () => {
    const today = Array.from({ length: 10 }, () => set('w2', 'bench', 80, 1, START + 60_000))
    const { summary, rankStates } = buildWorkoutSummary(input({ sets: today }), STD)
    expect(summary.diffs.every((d) => d.change === 'new')).toBe(true)
    expect(summary.promotions).toEqual([])
    expect(rankStates.chest).toEqual({ status: 'stable', tierIndex: tierIndexForScore(summary.diffs.find((d) => d.id === 'chest')!.after!.score) })
  })

  it('cruzar un tier abre promo: se muestra el tier anterior con 100 LP', () => {
    // pecho: antes ratio 0,875 (70/80) → después 1,5 (120/80): sube varios tiers
    const today = Array.from({ length: 10 }, () => set('w2', 'bench', 120, 1, START + 60_000))
    const before = buildWorkoutSummary(input({ sets: oldSession, workout: { id: 'w1', startedAt: START - 2 * DAY_MS - 1 }, endedAt: START - 2 * DAY_MS + 1 }), STD)
    const states = before.rankStates
    const { summary, rankStates } = buildWorkoutSummary(input({ sets: [...oldSession, ...today], rankStates: states }), STD)

    const chestEvent = summary.promotions.find((p) => p.id === 'chest')
    expect(chestEvent?.kind).toBe('started')
    expect(rankStates.chest?.status).toBe('promo')
    const chest = summary.diffs.find((d) => d.id === 'chest')!
    expect(chest.after).toMatchObject({ tierIndex: states.chest!.tierIndex, lp: 100 })
  })

  it('ganar la promo se refleja como ascenso', () => {
    // Antes: score 52 (Atleta, tier 2) con la promo abierta desde Aprendiz (tier 1) hacia Veterano (tier 3)
    const promo: PromotionState = { status: 'promo', tierIndex: 1, targetTierIndex: 3, wins: 1, losses: 0 }
    // Hoy: ratio 1 (intermedio) → fuerza 50, constancia 100 → 60 = Veterano
    const today = Array.from({ length: 10 }, () => set('w2', 'bench', 80, 1, START + 60_000))
    const { summary, rankStates } = buildWorkoutSummary(input({ sets: [...oldSession, ...today], rankStates: { chest: promo } }), STD)
    const after = summary.diffs.find((d) => d.id === 'chest')!
    expect(summary.promotions.find((p) => p.id === 'chest')?.kind).toBe('promoted')
    expect(rankStates.chest).toEqual({ status: 'stable', tierIndex: 3 })
    expect(after.change).toBe('promoted')
    expect(after.before).toMatchObject({ tierIndex: 1, lp: 100 })
  })

  it('sin sexo o peso: sin rangos pero con estadísticas y récords', () => {
    const today = [set('w2', 'bench', 80, 5, START + 60_000)]
    for (const over of [{ sex: undefined }, { bodyweightKg: undefined }, { bodyweightKg: 0 }]) {
      const { summary, rankStates } = buildWorkoutSummary(input({ sets: [...oldSession, ...today], ...over }), STD)
      expect(summary.ranked).toBe(false)
      expect(summary.diffs).toEqual([])
      expect(summary.workingSets).toBe(1)
      expect(summary.records).toHaveLength(1)
      expect(rankStates).toEqual({})
    }
  })

  it('ejercicios sin estándar no generan rangos', () => {
    const em: ExerciseMuscle[] = [...EM, { exerciseId: 'crunch', muscleId: 'abs', factor: 1 }]
    const today = [set('w2', 'crunch', 0, 20, START + 60_000)]
    const { summary } = buildWorkoutSummary(input({ sets: today, exerciseMuscles: em, muscleIds: [...MUSCLES, 'abs'] }), STD)
    expect(summary.diffs).toEqual([])
  })

  it('ignora series de otros entrenos posteriores al inicio', () => {
    const later = set('w3', 'bench', 200, 1, START + 10)
    const today = [set('w2', 'bench', 80, 1, START + 60_000)]
    const { summary } = buildWorkoutSummary(input({ sets: [...oldSession, later, ...today] }), STD)
    expect(summary.records).toHaveLength(1)
  })
})

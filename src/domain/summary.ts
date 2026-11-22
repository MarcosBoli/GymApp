import type { ExerciseMuscle, Sex, Timestamp, WorkoutSet } from './types'
import {
  advancePromotion,
  computeRankings,
  diffRanks,
  displayedRank,
  rankFromScore,
  type PromotionState,
  type RankConfig,
  type RankDiff,
  type RankSnapshot,
  type StrengthStandards,
} from './ranking'
import { findPersonalRecords, workoutStats, type PersonalRecord, type WorkoutStats } from './workout'
import { RANK_CONFIG, STRENGTH_STANDARDS } from '../data/ranking'

export const GLOBAL_RANK_ID = 'global'

export type PromotionEventKind = 'started' | 'won_game' | 'lost_game' | 'promoted' | 'failed' | 'demoted'

export interface PromotionEvent {
  id: string
  kind: PromotionEventKind
  state: PromotionState
}

export interface WorkoutSummary extends WorkoutStats {
  /** false si falta sexo o peso corporal: no hay rangos, solo estadísticas y récords. */
  ranked: boolean
  /** Músculos entrenados en la sesión + 'global'; ordenado por LP descendente. */
  diffs: RankDiff[]
  promotions: PromotionEvent[]
  records: PersonalRecord[]
}

/** Describe qué ha pasado con la promo tras una sesión (null si nada destacable). */
export function describePromotion(prev: PromotionState | undefined, next: PromotionState): PromotionEventKind | null {
  if (!prev) return null // colocación inicial
  if (prev.status === 'stable') {
    if (next.status === 'promo') return 'started'
    return next.tierIndex < prev.tierIndex ? 'demoted' : null
  }
  if (next.status === 'promo') return next.wins > prev.wins ? 'won_game' : 'lost_game'
  return next.tierIndex >= prev.targetTierIndex ? 'promoted' : 'failed'
}

type SummarySet = Pick<WorkoutSet, 'id' | 'workoutId' | 'exerciseId' | 'performedAt' | 'reps' | 'weightKg' | 'isWarmup'>

export interface SummaryInput {
  workout: { id: string; startedAt: Timestamp }
  endedAt: Timestamp
  /** Todas las series (de este entreno y anteriores). */
  sets: readonly SummarySet[]
  exerciseMuscles: readonly ExerciseMuscle[]
  muscleIds: readonly string[]
  sex?: Sex
  bodyweightKg?: number
  rankStates: Readonly<Record<string, PromotionState | undefined>>
}

/**
 * Calcula el "Resumen de partida": rangos antes (justo antes de empezar) y después
 * (al terminar), avanzando las promos de los músculos entrenados y del global.
 * Devuelve también los estados de promo actualizados para persistirlos.
 */
export function buildWorkoutSummary(
  input: SummaryInput,
  standards: StrengthStandards = STRENGTH_STANDARDS,
  config: RankConfig = RANK_CONFIG,
): { summary: WorkoutSummary; rankStates: Record<string, PromotionState> } {
  const { workout, endedAt, sets, exerciseMuscles, muscleIds, sex, bodyweightKg, rankStates } = input
  const workoutSets = sets.filter((s) => s.workoutId === workout.id)
  const previousSets = sets.filter((s) => s.workoutId !== workout.id && s.performedAt < workout.startedAt)

  const stats = workoutStats(workoutSets, workout.startedAt, endedAt)
  const records = findPersonalRecords(previousSets, workoutSets, { bodyweightKg, standards })
  const empty = { summary: { ...stats, ranked: false, diffs: [], promotions: [], records }, rankStates: {} }
  if (!sex || !(bodyweightKg !== undefined && bodyweightKg > 0)) return empty

  const base = { exerciseMuscles, muscleIds, bodyweightKg, sex }
  const before = computeRankings({ ...base, sets: previousSets, now: workout.startedAt - 1 }, standards, config)
  const after = computeRankings({ ...base, sets: [...previousSets, ...workoutSets], now: endedAt }, standards, config)

  const beforeScores = new Map<string, number | null>(before.muscles.map((m) => [m.muscleId, m.score]))
  beforeScores.set(GLOBAL_RANK_ID, before.global.score)
  const afterScores = new Map<string, number | null>(after.muscles.map((m) => [m.muscleId, m.score]))
  afterScores.set(GLOBAL_RANK_ID, after.global.score)

  const trainedExercises = new Set(workoutSets.filter((s) => !s.isWarmup && s.reps >= 1).map((s) => s.exerciseId))
  const trained = new Set(exerciseMuscles.filter((em) => trainedExercises.has(em.exerciseId)).map((em) => em.muscleId))
  const ids = [...muscleIds.filter((id) => trained.has(id)), GLOBAL_RANK_ID]

  const beforeSnap: RankSnapshot = {}
  const afterSnap: RankSnapshot = {}
  const nextStates: Record<string, PromotionState> = {}
  const promotions: PromotionEvent[] = []

  for (const id of ids) {
    const afterScore = afterScores.get(id) ?? null
    if (afterScore === null) continue
    const beforeScore = beforeScores.get(id) ?? null
    const prev = rankStates[id]
    beforeSnap[id] =
      beforeScore === null ? null : prev ? displayedRank(prev, beforeScore, config) : rankFromScore(beforeScore, config)
    const next = advancePromotion(prev, afterScore, config)
    afterSnap[id] = displayedRank(next, afterScore, config)
    nextStates[id] = next
    const kind = describePromotion(prev, next)
    if (kind) promotions.push({ id, kind, state: next })
  }

  return {
    summary: { ...stats, ranked: true, diffs: diffRanks(beforeSnap, afterSnap, config), promotions, records },
    rankStates: nextStates,
  }
}

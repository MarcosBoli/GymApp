/**
 * Datos para Inicio (rangos actuales con promos), la ficha de músculo y Progreso.
 * Todo puro: "ahora", series y estados entran por parámetro.
 */
import type { DateKey, ExerciseMuscle, Sex, Timestamp, Workout } from './types'
import {
  computeRankings,
  displayedRank,
  ladderPoints,
  rankFromScore,
  setE1RM,
  type MuscleRanking,
  type PromotionState,
  type Rank,
  type RankConfig,
  type RankedSet,
  type RankingInput,
  type StrengthStandards,
} from './ranking'
import { GLOBAL_RANK_ID } from './summary'
import { addDays, startOfWeek, toDateKey } from './dates'
import { RANK_CONFIG, STRENGTH_STANDARDS } from '../data/ranking'

// ─── Rangos actuales ───────────────────────────────────────────────────────

export interface MuscleStatus extends MuscleRanking {
  name: string
  /** Rango a mostrar (respeta la promo en curso). */
  displayed: Rank | null
  promo?: PromotionState
}

export interface RankOverview {
  muscles: MuscleStatus[]
  global: { score: number | null; displayed: Rank | null; promo?: PromotionState; trainedMuscles: number }
  weakLink: MuscleStatus | null
  inactive: MuscleStatus[]
  exercises: ReturnType<typeof computeRankings>['exercises']
}

const show = (score: number | null, state: PromotionState | undefined, config: RankConfig) =>
  score === null ? null : state ? displayedRank(state, score, config) : rankFromScore(score, config)

export function buildRankOverview(
  input: Omit<RankingInput, 'muscleIds' | 'sex'> & {
    /** Sin sexo no se puede puntuar la fuerza: todo queda sin rango. */
    sex?: Sex
    muscles: readonly { id: string; name: string }[]
    rankStates: Readonly<Record<string, PromotionState | undefined>>
  },
  standards: StrengthStandards = STRENGTH_STANDARDS,
  config: RankConfig = RANK_CONFIG,
): RankOverview {
  const r = computeRankings(
    { ...input, sex: input.sex ?? 'male', bodyweightKg: input.sex ? input.bodyweightKg : undefined, muscleIds: input.muscles.map((m) => m.id) },
    standards,
    config,
  )
  const names = new Map(input.muscles.map((m) => [m.id, m.name]))
  const muscles = r.muscles.map((m): MuscleStatus => {
    const promo = input.rankStates[m.muscleId]
    return { ...m, name: names.get(m.muscleId) ?? m.muscleId, displayed: show(m.score, promo, config), promo }
  })
  const globalPromo = input.rankStates[GLOBAL_RANK_ID]
  return {
    muscles,
    global: {
      score: r.global.score,
      displayed: show(r.global.score, globalPromo, config),
      promo: globalPromo,
      trainedMuscles: r.global.trainedMuscles,
    },
    weakLink: r.global.weakLink ? (muscles.find((m) => m.muscleId === r.global.weakLink!.muscleId) ?? null) : null,
    inactive: muscles.filter((m) => m.inactive),
    exercises: r.exercises,
  }
}

/** LP que faltan para la siguiente división (o tier). */
export const lpToNext = (rank: Rank) => Math.max(0, 100 - rank.lp)

// ─── Ficha de músculo ──────────────────────────────────────────────────────

export interface Contribution {
  exerciseId: string
  factor: 1 | 0.5
  score: number
  e1rm: number
  /** Parte del score de fuerza del músculo que aporta (0..1). */
  share: number
}

/** Ejercicios que más suman a un músculo: score × factor, de mayor a menor. */
export function muscleContributions(
  muscleId: string,
  exercises: ReadonlyMap<string, { e1rm: number; score: number | null }>,
  exerciseMuscles: readonly ExerciseMuscle[],
): Contribution[] {
  const list = exerciseMuscles
    .filter((em) => em.muscleId === muscleId)
    .flatMap((em) => {
      const ex = exercises.get(em.exerciseId)
      return ex && ex.score !== null ? [{ exerciseId: em.exerciseId, factor: em.factor, score: ex.score, e1rm: ex.e1rm, weighted: ex.score * em.factor }] : []
    })
  const total = list.reduce((s, c) => s + c.weighted, 0)
  return list
    .sort((a, b) => b.weighted - a.weighted || a.exerciseId.localeCompare(b.exerciseId))
    .map(({ weighted, ...c }) => ({ ...c, share: total > 0 ? weighted / total : 0 }))
}

/** Ejercicios del músculo ordenados por las veces que se han hecho (para elegir gráfica). */
export function exercisesForMuscle(muscleId: string, sets: readonly RankedSet[], exerciseMuscles: readonly ExerciseMuscle[]): string[] {
  const ids = new Set(exerciseMuscles.filter((em) => em.muscleId === muscleId).map((em) => em.exerciseId))
  const count = new Map<string, number>()
  for (const s of sets) if (ids.has(s.exerciseId) && !s.isWarmup) count.set(s.exerciseId, (count.get(s.exerciseId) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id)
}

/** Mejor e1RM de cada día en que se hizo el ejercicio. */
export function e1rmHistory(
  sets: readonly RankedSet[],
  exerciseId: string,
  opts: { bodyweightKg?: number; standards?: StrengthStandards } = {},
): { date: DateKey; e1rm: number }[] {
  const addBodyweight = (opts.standards ?? STRENGTH_STANDARDS).exercises[exerciseId]?.addBodyweight
  const best = new Map<DateKey, number>()
  for (const s of sets) {
    if (s.exerciseId !== exerciseId) continue
    const e = setE1RM(s, { addBodyweight, bodyweightKg: opts.bodyweightKg })
    if (e === null) continue
    const day = toDateKey(new Date(s.performedAt))
    if (e > (best.get(day) ?? -Infinity)) best.set(day, e)
  }
  return [...best.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, e1rm]) => ({ date, e1rm }))
}

// ─── Progreso ──────────────────────────────────────────────────────────────

/**
 * Series efectivas por músculo y semana (lunes–domingo), las `weeks` últimas
 * incluida la actual. Las de músculo secundario cuentan su factor (0,5).
 */
export function weeklyVolumeByMuscle(
  sets: readonly RankedSet[],
  exerciseMuscles: readonly ExerciseMuscle[],
  today: DateKey,
  weeks = 8,
): { weekStarts: DateKey[]; byMuscle: Map<string, number[]> } {
  const current = startOfWeek(today)
  const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(current, -7 * (weeks - 1 - i)))
  const index = new Map(weekStarts.map((w, i) => [w, i]))
  const byExercise = new Map<string, ExerciseMuscle[]>()
  for (const em of exerciseMuscles) byExercise.set(em.exerciseId, [...(byExercise.get(em.exerciseId) ?? []), em])

  const byMuscle = new Map<string, number[]>()
  for (const s of sets) {
    if (s.isWarmup || s.reps < 1) continue
    const day = toDateKey(new Date(s.performedAt))
    if (day > today) continue
    const i = index.get(startOfWeek(day))
    if (i === undefined) continue
    for (const em of byExercise.get(s.exerciseId) ?? []) {
      const row = byMuscle.get(em.muscleId) ?? Array<number>(weeks).fill(0)
      row[i]! += em.factor
      byMuscle.set(em.muscleId, row)
    }
  }
  return { weekStarts, byMuscle }
}

/** Tramos del mapa de calor de volumen (series/semana). Óptimo 10-20. */
export const VOLUME_BINS = [
  { min: 0, max: 0, label: '0' },
  { min: 0.5, max: 5, label: '≤5' },
  { min: 5.5, max: 10, label: '6-10' },
  { min: 10.5, max: 15, label: '11-15' },
  { min: 15.5, max: 20, label: '16-20' },
  { min: 20.5, max: Infinity, label: '>20' },
] as const

export function volumeBin(sets: number): number {
  if (sets <= 0) return 0
  return VOLUME_BINS.findIndex((b, i) => i > 0 && sets <= b.max)
}

export interface RankHistoryPoint {
  at: Timestamp
  rank: Rank
  points: number
}

/** Rango tras cada entreno terminado (de los resúmenes guardados) para un músculo o 'global'. */
export function rankHistory(workouts: readonly Pick<Workout, 'endedAt' | 'summary'>[], id: string, config: RankConfig = RANK_CONFIG): RankHistoryPoint[] {
  return workouts
    .flatMap((w) => {
      const after = w.endedAt !== undefined ? w.summary?.diffs.find((d) => d.id === id)?.after : undefined
      return after ? [{ at: w.endedAt!, rank: after, points: ladderPoints(after, config) }] : []
    })
    .sort((a, b) => a.at - b.at)
}

/** Marcas del eje de la escalera: dónde empieza cada tier. */
export function tierTicks(config: RankConfig = RANK_CONFIG): { points: number; name: string; color: string }[] {
  return config.tiers.map((t) => ({ points: ladderPoints(rankFromScore(t.minScore, config), config), name: t.name, color: t.color }))
}

/** Pesajes y tendencia de los últimos `days` días (o todos con days = Infinity). */
export function weightWindow<T extends { date: DateKey }>(points: readonly T[], today: DateKey, days: number): T[] {
  if (!Number.isFinite(days)) return points.filter((p) => p.date <= today)
  const from = addDays(today, -(days - 1))
  return points.filter((p) => p.date >= from && p.date <= today)
}

/** Ejercicios a ofrecer en la gráfica de e1RM: primero los que más suman, luego los más hechos. */
export function chartExerciseOptions(contributions: readonly Contribution[], mostDone: readonly string[], max = 5): string[] {
  return [...new Set([...contributions.map((c) => c.exerciseId), ...mostDone])].slice(0, max)
}

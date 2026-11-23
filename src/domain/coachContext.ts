/**
 * Resumen compacto del usuario para que la IA diseñe la rutina semanal.
 * Todo puro: "hoy", series y planes entran por parámetro.
 */
import type { DateKey, ExerciseMuscle, Timestamp, UserProfile, WeekFeedback, WeeklyPlan, Workout } from './types'
import type { CoachContext, PlanEquipment, TrainingGoal } from './planSchema'
import type { RankOverview } from './progress'
import { addDays, calendarDaysBetween, fromDateKey } from './dates'
import { ageOn } from './energy'
import { DAY_MS, formatRank, setE1RM, type RankedSet, type StrengthStandards } from './ranking'
import { weekAdherence } from './plan'
import { STRENGTH_STANDARDS } from '../data/ranking'

/** Campos de entrenamiento obligatorios para pedir un plan. */
export interface TrainingPrefs {
  trainingGoal: TrainingGoal
  daysPerWeek: number
  sessionMinutes: number
  equipment: PlanEquipment[]
  limitations: string
}

/** Preferencias completas o null (falta algo en Perfil). */
export function trainingPrefs(profile: UserProfile | undefined): TrainingPrefs | null {
  if (!profile?.trainingGoal || !profile.daysPerWeek || !profile.sessionMinutes || !profile.equipment?.length) return null
  return {
    trainingGoal: profile.trainingGoal,
    daysPerWeek: profile.daysPerWeek,
    sessionMinutes: profile.sessionMinutes,
    equipment: profile.equipment,
    limitations: (profile.limitations ?? '').trim(),
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Tendencia del e1RM de un músculo en 4 semanas: para cada ejercicio principal del músculo
 * con series en las dos mitades, cambio % del mejor e1RM (últimos 14 días frente a los 14
 * anteriores); media ponderada por factor. null si no hay datos en ambas mitades.
 */
export function e1rmTrend4w(
  muscleId: string,
  sets: readonly RankedSet[],
  exerciseMuscles: readonly ExerciseMuscle[],
  now: Timestamp,
  opts: { bodyweightKg?: number; standards?: StrengthStandards } = {},
): number | null {
  const standards = opts.standards ?? STRENGTH_STANDARDS
  const mid = now - 14 * DAY_MS
  const start = now - 28 * DAY_MS
  let sum = 0
  let weight = 0
  for (const em of exerciseMuscles) {
    if (em.muscleId !== muscleId || em.factor !== 1) continue
    let recent = 0
    let before = 0
    for (const s of sets) {
      if (s.exerciseId !== em.exerciseId || s.performedAt > now || s.performedAt < start) continue
      const e = setE1RM(s, { addBodyweight: standards.exercises[s.exerciseId]?.addBodyweight, bodyweightKg: opts.bodyweightKg })
      if (e === null) continue
      if (s.performedAt >= mid) recent = Math.max(recent, e)
      else before = Math.max(before, e)
    }
    if (recent > 0 && before > 0) {
      sum += ((recent - before) / before) * 100 * em.factor
      weight += em.factor
    }
  }
  return weight > 0 ? round1(sum / weight) : null
}

/** Series efectivas medias por semana en las últimas 4 semanas (secundarios cuentan su factor). */
export function averageWeeklySets(muscleId: string, sets: readonly RankedSet[], exerciseMuscles: readonly ExerciseMuscle[], now: Timestamp): number {
  const factor = new Map(exerciseMuscles.filter((em) => em.muscleId === muscleId).map((em) => [em.exerciseId, em.factor]))
  const start = now - 28 * DAY_MS
  let total = 0
  for (const s of sets) {
    if (s.isWarmup || s.reps < 1 || s.performedAt > now || s.performedAt < start) continue
    total += factor.get(s.exerciseId) ?? 0
  }
  return round1(total / 4)
}

export interface CoachContextInput {
  weekStart: DateKey
  today: DateKey
  now: Timestamp
  profile: UserProfile
  prefs: TrainingPrefs
  bodyweightKg?: number
  overview: RankOverview
  /** Series de al menos las últimas 4 semanas. */
  sets: readonly RankedSet[]
  exerciseMuscles: readonly ExerciseMuscle[]
  previousWeek: {
    plan?: WeeklyPlan
    workouts: readonly Pick<Workout, 'planId' | 'planDayIndex' | 'endedAt'>[]
    feedback?: WeekFeedback
  }
}

export function buildCoachContext(input: CoachContextInput): CoachContext {
  const { overview, now, sets, exerciseMuscles, bodyweightKg, prefs, profile } = input
  const muscles = overview.muscles.map((m) => ({
    id: m.muscleId,
    name: m.name,
    rank: m.displayed ? formatRank(m.displayed) : null,
    lp: m.displayed?.lp ?? null,
    e1rmTrend4wPct: e1rmTrend4w(m.muscleId, sets, exerciseMuscles, now, { bodyweightKg }),
    weeklySets: averageWeeklySets(m.muscleId, sets, exerciseMuscles, now),
    daysSinceLast: m.lastTrainedAt === undefined ? null : calendarDaysBetween(new Date(m.lastTrainedAt), fromDateKey(input.today)),
  }))
  const weak = overview.weakLink
  const lastWeek = weekAdherence(input.previousWeek.plan, input.previousWeek.workouts, prefs.daysPerWeek)
  return {
    weekStart: input.weekStart,
    profile: {
      sex: profile.sex,
      age: profile.birthDate ? ageOn(profile.birthDate, input.today) : null,
      heightCm: profile.heightCm,
      weightKg: bodyweightKg ?? null,
      trainingGoal: prefs.trainingGoal,
      daysPerWeek: prefs.daysPerWeek,
      sessionMinutes: prefs.sessionMinutes,
      equipment: prefs.equipment,
      limitations: prefs.limitations.slice(0, 500),
    },
    muscles,
    weakLink: weak?.displayed ? { id: weak.muscleId, name: weak.name, rank: formatRank(weak.displayed) } : null,
    lastWeek: {
      ...lastWeek,
      adherence: lastWeek.adherence === null ? null : Math.round(lastWeek.adherence * 100) / 100,
      rating: input.previousWeek.feedback?.rating ?? null,
    },
  }
}

/** Ventana de series necesaria para el contexto (4 semanas + margen). */
export const COACH_SETS_WINDOW_DAYS = 42

export const previousWeekStart = (weekStart: DateKey) => addDays(weekStart, -7)

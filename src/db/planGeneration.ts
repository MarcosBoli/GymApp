import type { DateKey, WeeklyPlan } from '../domain/types'
import type { PlanOutput, PlanRequest } from '../domain/planSchema'
import { buildCoachContext, trainingPrefs } from '../domain/coachContext'
import { buildCatalog, toPlanDays } from '../domain/plan'
import { buildRankOverview } from '../domain/progress'
import { bestE1RMByExercise } from '../domain/ranking'
import { toDateKey } from '../domain/dates'
import { db as defaultDb, type GymDB } from './db'
import { getRankingInputs } from './rankings'
import { getCoachInputs, savePlanVersion } from './plans'
import { getExerciseSets } from './workouts'

export class MissingTrainingPrefsError extends Error {
  constructor() {
    super('Completa en Perfil tu objetivo, días por semana, minutos por sesión y material.')
  }
}

/** Contexto + catálogo que se envían a /api/plan. */
export async function buildPlanRequest(weekStart: DateKey, now: number, db: GymDB = defaultDb): Promise<PlanRequest> {
  const [rank, coach, exerciseMuscles, muscles] = await Promise.all([
    getRankingInputs(now, db),
    getCoachInputs(weekStart, now, db),
    db.exerciseMuscles.toArray(),
    db.muscles.toArray(),
  ])
  const prefs = trainingPrefs(coach.profile)
  if (!coach.profile || !prefs) throw new MissingTrainingPrefsError()
  const overview = buildRankOverview(rank)
  const context = buildCoachContext({
    weekStart,
    today: toDateKey(new Date(now)),
    now,
    profile: coach.profile,
    prefs,
    bodyweightKg: coach.bodyweightKg,
    overview,
    sets: coach.sets,
    exerciseMuscles,
    previousWeek: coach.previousWeek,
  })
  return { context, catalog: buildCatalog(coach.exercises, exerciseMuscles, muscles, prefs.equipment) }
}

/**
 * Genera (o regenera) el plan de la semana: arma el contexto, llama a la IA mediante
 * `requestPlan` (inyectable) y guarda una versión nueva con historial.
 */
export async function generateWeekPlan(
  weekStart: DateKey,
  now: number,
  requestPlan: (body: PlanRequest) => Promise<{ plan: PlanOutput; model: string }>,
  db: GymDB = defaultDb,
): Promise<WeeklyPlan> {
  const body = await buildPlanRequest(weekStart, now, db)
  const { plan, model } = await requestPlan(body)
  return savePlanVersion({ weekStart, source: 'ai', days: toPlanDays(plan), reasoning: plan.reasoning.trim(), model }, now, db)
}

/** Mejor e1RM reciente (90 días) de cada ejercicio, para calcular el peso sugerido. */
export async function getRecentE1RMs(exerciseIds: readonly string[], now: number, bodyweightKg?: number, db: GymDB = defaultDb): Promise<Map<string, number>> {
  const sets = (await Promise.all([...new Set(exerciseIds)].map((id) => getExerciseSets(id, db)))).flat()
  const best = bestE1RMByExercise(sets, { now, bodyweightKg, windowDays: 90 })
  return new Map([...best].map(([id, b]) => [id, b.e1rm]))
}

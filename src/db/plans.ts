import type { DateKey, PlanDay, WeekFeedback, WeeklyPlan, Workout } from '../domain/types'
import type { WeekRating } from '../domain/planSchema'
import { addDays, fromDateKey } from '../domain/dates'
import { COACH_SETS_WINDOW_DAYS } from '../domain/coachContext'
import { completedDayIndexes, dayToTrain, weekToRate } from '../domain/plan'
import { DAY_MS } from '../domain/ranking'
import { db as defaultDb, type GymDB } from './db'
import { newId } from './ids'
import { getBodyweightAt, getSetsBetween } from './workouts'

/** Versión vigente del plan de una semana (la más reciente no sustituida). */
export async function getActivePlan(weekStart: DateKey, db: GymDB = defaultDb): Promise<WeeklyPlan | undefined> {
  const versions = await db.weeklyPlans.where('weekStart').equals(weekStart).toArray()
  return versions.filter((p) => p.status === 'active').sort((a, b) => b.createdAt - a.createdAt)[0]
}

/** Todas las versiones de una semana, la más reciente primero. */
export async function listPlanVersions(weekStart: DateKey, db: GymDB = defaultDb): Promise<WeeklyPlan[]> {
  return (await db.weeklyPlans.where('weekStart').equals(weekStart).toArray()).sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Guarda una versión nueva del plan de la semana y deja las anteriores como historial
 * (status 'superseded'). Sirve para generar, regenerar, editar a mano o restaurar.
 */
export async function savePlanVersion(
  plan: Omit<WeeklyPlan, 'id' | 'status' | 'createdAt'>,
  now: number,
  db: GymDB = defaultDb,
): Promise<WeeklyPlan> {
  return db.transaction('rw', db.weeklyPlans, async () => {
    await db.weeklyPlans.where('weekStart').equals(plan.weekStart).modify((p) => {
      p.status = 'superseded'
    })
    const saved: WeeklyPlan = { ...plan, id: newId(), status: 'active', createdAt: now }
    await db.weeklyPlans.add(saved)
    return saved
  })
}

/** Edición a mano: nueva versión con los días cambiados (el historial conserva la anterior). */
export async function editPlanDays(planId: string, days: PlanDay[], now: number, db: GymDB = defaultDb): Promise<WeeklyPlan> {
  const current = await db.weeklyPlans.get(planId)
  if (!current) throw new Error('Plan no encontrado')
  const { id: _id, status: _s, createdAt: _c, ...rest } = current
  return savePlanVersion({ ...rest, days, source: 'manual' }, now, db)
}

/** Entrenos que empezaron dentro de la semana [weekStart, weekStart + 7 días). */
export async function getWeekWorkouts(weekStart: DateKey, db: GymDB = defaultDb): Promise<Workout[]> {
  const from = fromDateKey(weekStart).getTime()
  const to = fromDateKey(addDays(weekStart, 7)).getTime()
  return db.workouts.where('startedAt').between(from, to, true, false).toArray()
}

export async function getWeekFeedback(weekStart: DateKey, db: GymDB = defaultDb): Promise<WeekFeedback | undefined> {
  return db.weekFeedback.get(weekStart)
}

export async function listWeekFeedback(db: GymDB = defaultDb): Promise<WeekFeedback[]> {
  return db.weekFeedback.toArray()
}

export async function saveWeekFeedback(weekStart: DateKey, rating: WeekRating, now: number, db: GymDB = defaultDb): Promise<void> {
  await db.weekFeedback.put({ weekStart, rating, createdAt: now })
}

/** ¿Hubo plan o entrenos terminados en la semana? (para saber si preguntar su valoración) */
export async function weekHadActivity(weekStart: DateKey, db: GymDB = defaultDb): Promise<boolean> {
  if (await getActivePlan(weekStart, db)) return true
  return (await getWeekWorkouts(weekStart, db)).some((w) => w.endedAt !== undefined)
}

/** Datos para el contexto del entrenador (buildCoachContext) además de los rangos. */
export async function getCoachInputs(weekStart: DateKey, now: number, db: GymDB = defaultDb) {
  const previous = addDays(weekStart, -7)
  const [profile, bodyweightKg, sets, exercises, previousPlan, previousWorkouts, previousFeedback] = await Promise.all([
    db.userProfile.get('me'),
    getBodyweightAt(now, db),
    getSetsBetween(now - COACH_SETS_WINDOW_DAYS * DAY_MS, now, db),
    db.exercises.toArray(),
    getActivePlan(previous, db),
    getWeekWorkouts(previous, db),
    getWeekFeedback(previous, db),
  ])
  return { profile, bodyweightKg, sets, exercises, previousWeek: { plan: previousPlan, workouts: previousWorkouts, feedback: previousFeedback } }
}

/** Estado de la semana para la tarjeta del plan: plan vigente, días hechos, día que toca y valoración pendiente. */
export async function getWeekStatus(weekStart: DateKey, today: DateKey, db: GymDB = defaultDb) {
  const [plan, workouts, feedback] = await Promise.all([getActivePlan(weekStart, db), getWeekWorkouts(weekStart, db), listWeekFeedback(db)])
  const done = plan ? completedDayIndexes(plan, workouts) : new Set<number>()
  return {
    plan,
    done,
    next: plan ? dayToTrain(plan, today, done) : null,
    rateWeek: weekToRate({ today, currentWeekStart: weekStart, currentPlan: plan, feedback, previousWeekHadActivity: false }),
  }
}

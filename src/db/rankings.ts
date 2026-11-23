import type { PromotionState } from '../domain/ranking'
import { toDateKey } from '../domain/dates'
import { db as defaultDb, type GymDB } from './db'
import { getBodyweightAt } from './workouts'

/** Todo lo necesario para calcular los rangos actuales (Inicio y ficha de músculo). */
export async function getRankingInputs(now: number, db: GymDB = defaultDb) {
  const [sets, exerciseMuscles, muscles, exercises, profile, bodyweightKg, stateRows] = await Promise.all([
    db.sets.toArray(),
    db.exerciseMuscles.toArray(),
    db.muscles.toArray(),
    db.exercises.toArray(),
    db.userProfile.get('me'),
    getBodyweightAt(now, db),
    db.rankStates.toArray(),
  ])
  const rankStates: Record<string, PromotionState> = Object.fromEntries(stateRows.map((r) => [r.id, r.state]))
  return {
    sets: sets.filter((s) => s.performedAt <= now),
    exerciseMuscles,
    muscles: muscles.sort((a, b) => a.order - b.order).map((m) => ({ id: m.id, name: m.name })),
    exerciseNames: new Map(exercises.map((e) => [e.id, e.name])),
    sex: profile?.sex,
    bodyweightKg,
    rankStates,
    now,
  }
}
export type RankingInputs = Awaited<ReturnType<typeof getRankingInputs>>

/** Datos de Progreso: pesajes, series y entrenos terminados con resumen. */
export async function getProgressInputs(now: number, db: GymDB = defaultDb) {
  const today = toDateKey(new Date(now))
  const [weights, sets, exerciseMuscles, muscles, workouts] = await Promise.all([
    db.bodyweightLogs.where('date').belowOrEqual(today).toArray(),
    db.sets.toArray(),
    db.exerciseMuscles.toArray(),
    db.muscles.toArray(),
    db.workouts.orderBy('startedAt').filter((w) => w.endedAt !== undefined && w.summary !== undefined).toArray(),
  ])
  return { today, weights, sets, exerciseMuscles, muscles: muscles.sort((a, b) => a.order - b.order), workouts }
}

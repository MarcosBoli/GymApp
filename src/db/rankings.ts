import type { PromotionState } from '../domain/ranking'
import { addDays, fromDateKey, startOfWeek, toDateKey } from '../domain/dates'
import { DAY_MS } from '../domain/ranking'
import { RANK_CONFIG } from '../data/ranking'
import { db as defaultDb, type GymDB } from './db'
import { getBodyweightAt, getSetsBetween } from './workouts'

/** Semanas del mapa de calor de Progreso. */
export const VOLUME_WEEKS = 8

/**
 * Todo lo necesario para calcular los rangos actuales (Inicio y ficha de músculo).
 * Solo lee la ventana de fuerza (42 días): un músculo sin series en ella no tiene rango,
 * así que lo anterior no cambia el resultado. El historial de e1RM se pide aparte.
 */
export async function getRankingInputs(now: number, db: GymDB = defaultDb) {
  const [sets, exerciseMuscles, muscles, exercises, profile, bodyweightKg, stateRows] = await Promise.all([
    getSetsBetween(now - (RANK_CONFIG.windows.strengthDays + 1) * DAY_MS, now, db),
    db.exerciseMuscles.toArray(),
    db.muscles.toArray(),
    db.exercises.toArray(),
    db.userProfile.get('me'),
    getBodyweightAt(now, db),
    db.rankStates.toArray(),
  ])
  const rankStates: Record<string, PromotionState> = Object.fromEntries(stateRows.map((r) => [r.id, r.state]))
  return {
    sets,
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
  const firstWeek = addDays(startOfWeek(today), -7 * (VOLUME_WEEKS - 1))
  const [weights, sets, exerciseMuscles, muscles, workouts] = await Promise.all([
    db.bodyweightLogs.where('date').belowOrEqual(today).toArray(),
    getSetsBetween(fromDateKey(firstWeek).getTime(), now, db),
    db.exerciseMuscles.toArray(),
    db.muscles.toArray(),
    db.workouts.orderBy('startedAt').filter((w) => w.endedAt !== undefined && w.summary !== undefined).toArray(),
  ])
  return { today, weights, sets, exerciseMuscles, muscles: muscles.sort((a, b) => a.order - b.order), workouts }
}

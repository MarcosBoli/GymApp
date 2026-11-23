import type { Exercise, ExerciseMuscle, Muscle, WorkoutSet } from './types'
import { formatDecimal, parseDecimal } from './number'
import { setE1RM, type StrengthStandards } from './ranking'
import { STRENGTH_STANDARDS } from '../data/ranking'

type SetValues = Pick<WorkoutSet, 'weightKg' | 'reps' | 'isWarmup'>

// ─── Autorrelleno ──────────────────────────────────────────────────────────

/**
 * Propuesta para la siguiente serie de trabajo de un ejercicio:
 * 1. La serie de trabajo equivalente (misma posición) de la última sesión.
 * 2. Si ya no hay equivalente, repetir la última serie de trabajo de hoy.
 * 3. Si hoy aún no hay series, la última serie de trabajo de la sesión anterior.
 */
export function suggestNextSet(
  lastSession: readonly SetValues[],
  today: readonly SetValues[],
): { weightKg: number; reps: number } | null {
  const prev = lastSession.filter((s) => !s.isWarmup)
  const cur = today.filter((s) => !s.isWarmup)
  const pick = prev[cur.length] ?? cur.at(-1) ?? prev.at(-1)
  return pick ? { weightKg: pick.weightKg, reps: pick.reps } : null
}

/** "80 × 8 · 80 × 7" (solo series de trabajo). */
export function formatSetsLine(sets: readonly SetValues[]): string {
  return sets
    .filter((s) => !s.isWarmup)
    .map((s) => `${formatDecimal(s.weightKg)} × ${s.reps}`)
    .join(' · ')
}

// ─── Validación de una serie ───────────────────────────────────────────────

export const MAX_WEIGHT_KG = 1000
export const MAX_REPS = 100

export type ParseSetResult =
  | { ok: true; value: { weightKg: number; reps: number; rpe?: number } }
  | { ok: false; error: string }

/**
 * Valida lo escrito en los inputs. En ejercicios de peso corporal el peso es lastre:
 * vacío = 0 y puede ser negativo (asistencia).
 */
export function parseSetInput(
  input: { weight: string; reps: string; rpe?: string },
  opts: { bodyweight?: boolean } = {},
): ParseSetResult {
  const weightText = input.weight.trim()
  const weightKg = weightText === '' && opts.bodyweight ? 0 : parseDecimal(weightText)
  if (weightKg === null) return { ok: false, error: 'Introduce el peso.' }
  if (!opts.bodyweight && weightKg < 0) return { ok: false, error: 'El peso no puede ser negativo.' }
  if (Math.abs(weightKg) > MAX_WEIGHT_KG) return { ok: false, error: 'Peso demasiado alto.' }

  const reps = parseDecimal(input.reps)
  if (reps === null || !Number.isInteger(reps) || reps < 1) {
    return { ok: false, error: 'Las repeticiones deben ser un número entero mayor que 0.' }
  }
  if (reps > MAX_REPS) return { ok: false, error: 'Demasiadas repeticiones.' }

  const rpeText = input.rpe?.trim() ?? ''
  if (rpeText === '') return { ok: true, value: { weightKg, reps } }
  const rpe = parseDecimal(rpeText)
  if (rpe === null || rpe < 1 || rpe > 10 || (rpe * 2) % 1 !== 0) {
    return { ok: false, error: 'El RPE va de 1 a 10 en pasos de 0,5.' }
  }
  return { ok: true, value: { weightKg, reps, rpe } }
}

// ─── Buscador de ejercicios ────────────────────────────────────────────────

export interface ExerciseSearchItem {
  id: string
  name: string
  /** Nombres de los músculos principales. */
  primaryMuscles: string[]
}

export function buildExerciseIndex(
  exercises: readonly Exercise[],
  exerciseMuscles: readonly ExerciseMuscle[],
  muscles: readonly Muscle[],
): ExerciseSearchItem[] {
  const muscleName = new Map(muscles.map((m) => [m.id, m.name]))
  return exercises.map((e) => ({
    id: e.id,
    name: e.name,
    primaryMuscles: exerciseMuscles
      .filter((em) => em.exerciseId === e.id && em.factor === 1)
      .map((em) => muscleName.get(em.muscleId) ?? em.muscleId),
  }))
}

export const normalizeText = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/**
 * Busca por nombre o músculo, sin tildes ni mayúsculas; todas las palabras deben aparecer.
 * Orden: empieza por la búsqueda > contiene la frase > resto; después alfabético.
 */
export function searchExercises(items: readonly ExerciseSearchItem[], query: string): ExerciseSearchItem[] {
  const q = normalizeText(query)
  const byName = (a: ExerciseSearchItem, b: ExerciseSearchItem) => a.name.localeCompare(b.name, 'es')
  if (!q) return [...items].sort(byName)

  const tokens = q.split(/\s+/)
  const scored: { item: ExerciseSearchItem; rank: number }[] = []
  for (const item of items) {
    const name = normalizeText(item.name)
    const haystack = `${name} ${normalizeText(item.primaryMuscles.join(' '))}`
    if (!tokens.every((t) => haystack.includes(t))) continue
    const rank = name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2
    scored.push({ item, rank })
  }
  return scored.sort((a, b) => a.rank - b.rank || byName(a.item, b.item)).map((s) => s.item)
}

// ─── Estadísticas y récords ────────────────────────────────────────────────

export interface WorkoutStats {
  durationMs: number
  workingSets: number
  /** Σ peso × reps de las series de trabajo (en peso corporal cuenta solo el lastre). */
  volumeKg: number
  exerciseCount: number
}

export function workoutStats(
  sets: readonly Pick<WorkoutSet, 'exerciseId' | 'weightKg' | 'reps' | 'isWarmup'>[],
  startedAt: number,
  endedAt: number,
): WorkoutStats {
  const working = sets.filter((s) => !s.isWarmup && s.reps >= 1)
  return {
    durationMs: Math.max(0, endedAt - startedAt),
    workingSets: working.length,
    volumeKg: working.reduce((sum, s) => sum + Math.max(0, s.weightKg) * s.reps, 0),
    exerciseCount: new Set(working.map((s) => s.exerciseId)).size,
  }
}

export interface PersonalRecord {
  exerciseId: string
  setId: string
  weightKg: number
  reps: number
  e1rm: number
  previousBest: number
}

type PRSet = Pick<WorkoutSet, 'id' | 'exerciseId' | 'weightKg' | 'reps' | 'isWarmup'>

/**
 * Récords de e1RM: ejercicios del entreno cuya mejor serie supera la mejor marca
 * histórica previa. La primera vez que se hace un ejercicio no cuenta como récord.
 */
export function findPersonalRecords(
  previousSets: readonly PRSet[],
  workoutSets: readonly PRSet[],
  opts: { bodyweightKg?: number; standards?: StrengthStandards } = {},
): PersonalRecord[] {
  const standards = opts.standards ?? STRENGTH_STANDARDS
  const e1rmOf = (s: PRSet) =>
    setE1RM(s, { addBodyweight: standards.exercises[s.exerciseId]?.addBodyweight, bodyweightKg: opts.bodyweightKg })

  const previousBest = new Map<string, number>()
  for (const s of previousSets) {
    const e = e1rmOf(s)
    if (e !== null && e > (previousBest.get(s.exerciseId) ?? -Infinity)) previousBest.set(s.exerciseId, e)
  }

  const bestToday = new Map<string, { set: PRSet; e1rm: number }>()
  for (const s of workoutSets) {
    const e = e1rmOf(s)
    if (e === null) continue
    const cur = bestToday.get(s.exerciseId)
    if (!cur || e > cur.e1rm) bestToday.set(s.exerciseId, { set: s, e1rm: e })
  }

  const records: PersonalRecord[] = []
  for (const [exerciseId, { set, e1rm }] of bestToday) {
    const prev = previousBest.get(exerciseId)
    if (prev === undefined || e1rm <= prev + 1e-9) continue
    records.push({ exerciseId, setId: set.id, weightKg: set.weightKg, reps: set.reps, e1rm, previousBest: prev })
  }
  return records
}

/** "3 × 8-12", "3 × 10", "3 series" o "" según los objetivos de la rutina. */
export function formatRoutineTarget(t: { targetSets?: number; targetRepsMin?: number; targetRepsMax?: number }): string {
  if (!t.targetSets) return ''
  const { targetRepsMin: min, targetRepsMax: max } = t
  if (min === undefined || max === undefined) return `${t.targetSets} series`
  return `${t.targetSets} × ${min === max ? min : `${min}-${max}`}`
}

/** Etiquetas de las series: "C" para calentamiento y 1, 2, 3… para las de trabajo. */
export function setLabels(sets: readonly Pick<WorkoutSet, 'isWarmup'>[]): string[] {
  let n = 0
  return sets.map((s) => (s.isWarmup ? 'C' : String(++n)))
}

/**
 * Primera propuesta de serie en un día del plan: mientras hoy no haya series de trabajo de
 * ese ejercicio, el peso que calcula la app (e1RM + rango + RPE) y las reps centrales; después
 * manda lo que se va haciendo (suggestNextSet).
 */
export function suggestPlannedSet(
  planned: { weightKg: number | null; repsMin: number; repsMax: number } | undefined,
  lastSession: readonly SetValues[],
  today: readonly SetValues[],
): { weightKg: number; reps: number } | null {
  const doneToday = today.some((s) => !s.isWarmup)
  if (planned && planned.weightKg !== null && !doneToday) {
    return { weightKg: planned.weightKg, reps: Math.round((planned.repsMin + planned.repsMax) / 2) }
  }
  return suggestNextSet(lastSession, today)
}

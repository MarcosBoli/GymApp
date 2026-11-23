import type { DateKey, Exercise, ExerciseMuscle, Muscle, PlanDay, PlanExercise, WeekFeedback, WeeklyPlan, Workout } from './types'
import type { CatalogItem, PlanEquipment, PlanOutput, WeekRating } from './planSchema'
export { planErrors } from './planSchema'
import { addDays, weekdayIndex } from './dates'
import { formatDecimal } from './number'

export const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const

export const RATING_LABELS: Record<WeekRating, string> = { hard: 'Dura', ok: 'Bien', easy: 'Fácil' }

// ─── Catálogo para la IA ───────────────────────────────────────────────────

/** Catálogo compacto con solo el material disponible (el peso corporal siempre vale). */
export function buildCatalog(
  exercises: readonly Exercise[],
  exerciseMuscles: readonly ExerciseMuscle[],
  muscles: readonly Muscle[],
  equipment: readonly PlanEquipment[],
): CatalogItem[] {
  const allowed = new Set<string>([...equipment, 'bodyweight'])
  const name = new Map(muscles.map((m) => [m.id, m.name]))
  return exercises
    .filter((e) => allowed.has(e.equipment))
    .map((e) => {
      const em = exerciseMuscles.filter((x) => x.exerciseId === e.id)
      return {
        id: e.id,
        name: e.name,
        equipment: e.equipment,
        primary: em.filter((x) => x.factor === 1).map((x) => name.get(x.muscleId) ?? x.muscleId),
        secondary: em.filter((x) => x.factor === 0.5).map((x) => name.get(x.muscleId) ?? x.muscleId),
      }
    })
}

/** Convierte la salida del modelo en días del plan, ordenados de lunes a domingo. */
export function toPlanDays(plan: PlanOutput): PlanDay[] {
  return [...plan.days]
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((d) => ({ dayIndex: d.dayIndex, name: d.name.trim() || DAY_NAMES[d.dayIndex]!, exercises: d.exercises.map((e) => ({ ...e, notes: e.notes.trim() })) }))
}

// ─── Peso sugerido (lo calcula la app, no el modelo) ───────────────────────

const INCREMENT: Record<string, number> = { barbell: 2.5, machine: 2.5, cable: 2.5, dumbbell: 2, bodyweight: 2.5, other: 2.5 }

/**
 * Peso para hacer las reps centrales del rango dejando las de reserva que marca el RPE:
 * carga = e1RM / (1 + (reps + RIR) / 30) (Epley inverso), redondeada al incremento del material.
 * En ejercicios de peso corporal devuelve el lastre (0 si basta con el propio peso).
 * null si no hay e1RM de referencia.
 */
export function suggestWeight(
  e1rm: number | undefined,
  target: Pick<PlanExercise, 'repsMin' | 'repsMax' | 'rpeTarget'>,
  equipment: string,
  bodyweightKg?: number,
): number | null {
  if (!e1rm || e1rm <= 0) return null
  const reps = Math.round((target.repsMin + target.repsMax) / 2)
  const rir = Math.max(0, 10 - target.rpeTarget)
  const load = e1rm / (1 + (reps + rir) / 30)
  const step = INCREMENT[equipment] ?? 2.5
  if (equipment === 'bodyweight') {
    if (!bodyweightKg) return null
    return Math.max(0, Math.floor((load - bodyweightKg) / step) * step)
  }
  return Math.max(0, Math.round(load / step) * step)
}

export function formatPlanTarget(e: Pick<PlanExercise, 'sets' | 'repsMin' | 'repsMax' | 'rpeTarget'>, weightKg?: number | null): string {
  const reps = e.repsMin === e.repsMax ? `${e.repsMin}` : `${e.repsMin}-${e.repsMax}`
  const weight = weightKg === null || weightKg === undefined ? '' : ` · ${formatDecimal(weightKg)} kg`
  return `${e.sets} × ${reps} @ RPE ${formatDecimal(e.rpeTarget)}${weight}`
}

// ─── Semana: día que toca, adherencia, valoración ──────────────────────────

/** Días del plan ya hechos (entrenos terminados de este plan). */
export function completedDayIndexes(plan: WeeklyPlan, workouts: readonly Pick<Workout, 'planId' | 'planDayIndex' | 'endedAt'>[]): Set<number> {
  return new Set(workouts.filter((w) => w.planId === plan.id && w.endedAt !== undefined && w.planDayIndex !== undefined).map((w) => w.planDayIndex!))
}

/** El día que toca: el de hoy si está pendiente; si no, el primer día pendiente. null si no queda ninguno. */
export function dayToTrain(plan: WeeklyPlan, today: DateKey, done: ReadonlySet<number>): PlanDay | null {
  const pending = plan.days.filter((d) => !done.has(d.dayIndex))
  return pending.find((d) => d.dayIndex === weekdayIndex(today)) ?? pending[0] ?? null
}

/** Adherencia de una semana: días hechos / días planificados (o entrenos / días por semana sin plan). */
export function weekAdherence(
  plan: WeeklyPlan | undefined,
  workoutsInWeek: readonly Pick<Workout, 'planId' | 'planDayIndex' | 'endedAt'>[],
  daysPerWeek: number,
): { planned: number | null; completed: number; adherence: number | null } {
  const finished = workoutsInWeek.filter((w) => w.endedAt !== undefined)
  if (plan) {
    const completed = completedDayIndexes(plan, finished).size
    return { planned: plan.days.length, completed, adherence: plan.days.length ? completed / plan.days.length : null }
  }
  if (finished.length === 0) return { planned: null, completed: 0, adherence: null }
  return { planned: null, completed: finished.length, adherence: Math.min(1, finished.length / daysPerWeek) }
}

/**
 * Qué semana hay que valorar:
 * - el domingo, la semana actual si tiene plan y aún no tiene valoración;
 * - al generar una semana nueva, la anterior si tuvo plan o entrenos y no se valoró.
 */
export function weekToRate(opts: {
  today: DateKey
  currentWeekStart: DateKey
  currentPlan?: WeeklyPlan
  feedback: readonly WeekFeedback[]
  generating?: boolean
  previousWeekHadActivity: boolean
}): DateKey | null {
  const rated = new Set(opts.feedback.map((f) => f.weekStart))
  const previous = addDays(opts.currentWeekStart, -7)
  if (opts.generating) return opts.previousWeekHadActivity && !rated.has(previous) ? previous : null
  if (weekdayIndex(opts.today) === 6 && opts.currentPlan && !rated.has(opts.currentWeekStart)) return opts.currentWeekStart
  return null
}

// ─── Edición del plan ──────────────────────────────────────────────────────

/**
 * Alternativas a un ejercicio: comparten músculos principales (más solape = mejor),
 * con el material disponible; desempata el mismo material y el nombre.
 */
export function equivalentExercises(
  exerciseId: string,
  exercises: readonly Exercise[],
  exerciseMuscles: readonly ExerciseMuscle[],
  equipment: readonly string[],
  limit = 8,
): Exercise[] {
  const primary = (id: string) => new Set(exerciseMuscles.filter((em) => em.exerciseId === id && em.factor === 1).map((em) => em.muscleId))
  const target = primary(exerciseId)
  const self = exercises.find((e) => e.id === exerciseId)
  const allowed = new Set([...equipment, 'bodyweight'])
  return exercises
    .filter((e) => e.id !== exerciseId && allowed.has(e.equipment))
    .map((e) => {
      const p = primary(e.id)
      const shared = [...p].filter((m) => target.has(m)).length
      const union = new Set([...p, ...target]).size
      return { e, score: union ? shared / union : 0 }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.e.equipment === self?.equipment) - Number(a.e.equipment === self?.equipment) || a.e.name.localeCompare(b.e.name, 'es'))
    .slice(0, limit)
    .map((x) => x.e)
}

/** Cambia un ejercicio de un día por otro conservando series, reps y RPE. */
export function swapExercise(days: readonly PlanDay[], dayIndex: number, position: number, newExerciseId: string): PlanDay[] {
  return days.map((d) =>
    d.dayIndex !== dayIndex ? d : { ...d, exercises: d.exercises.map((e, i) => (i === position ? { ...e, exerciseId: newExerciseId } : e)) },
  )
}

/** Edita campos de un ejercicio del plan, manteniendo repsMin ≤ repsMax y límites razonables. */
export function updatePlanExercise(days: readonly PlanDay[], dayIndex: number, position: number, patch: Partial<Omit<PlanExercise, 'exerciseId'>>): PlanDay[] {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  return days.map((d) => {
    if (d.dayIndex !== dayIndex) return d
    return {
      ...d,
      exercises: d.exercises.map((e, i) => {
        if (i !== position) return e
        const next = { ...e, ...patch }
        next.sets = clamp(Math.round(next.sets), 1, 8)
        next.repsMin = clamp(Math.round(next.repsMin), 1, 30)
        next.repsMax = clamp(Math.round(next.repsMax), 1, 30)
        if (next.repsMin > next.repsMax) {
          if (patch.repsMin !== undefined) next.repsMax = next.repsMin
          else next.repsMin = next.repsMax
        }
        next.rpeTarget = clamp(Math.round(next.rpeTarget * 2) / 2, 5, 10)
        return next
      }),
    }
  })
}

export function removePlanExercise(days: readonly PlanDay[], dayIndex: number, position: number): PlanDay[] {
  return days.map((d) => (d.dayIndex !== dayIndex ? d : { ...d, exercises: d.exercises.filter((_, i) => i !== position) }))
}

export function addPlanExercise(days: readonly PlanDay[], dayIndex: number, exerciseId: string): PlanDay[] {
  return days.map((d) =>
    d.dayIndex !== dayIndex ? d : { ...d, exercises: [...d.exercises, { exerciseId, sets: 3, repsMin: 8, repsMax: 12, rpeTarget: 8, notes: '' }] },
  )
}

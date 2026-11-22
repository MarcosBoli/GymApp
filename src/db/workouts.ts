import Dexie from 'dexie'
import type { RoutineExercise, Workout, WorkoutSet } from '../domain/types'
import { buildWorkoutSummary } from '../domain/summary'
import type { PromotionState } from '../domain/ranking'
import { toDateKey } from '../domain/dates'
import { db as defaultDb, type GymDB } from './db'
import { newId } from './ids'

/** Entreno en curso (sin endedAt); como mucho hay uno. */
export async function getActiveWorkout(db: GymDB = defaultDb): Promise<Workout | undefined> {
  return (await db.workouts.orderBy('startedAt').reverse().filter((w) => w.endedAt === undefined).first()) ?? undefined
}

export async function getLastFinishedWorkout(db: GymDB = defaultDb): Promise<Workout | undefined> {
  return db.workouts.orderBy('startedAt').reverse().filter((w) => w.endedAt !== undefined).first()
}

/** Empieza un entreno vacío o desde una rutina. Si ya hay uno en curso, lo devuelve. */
export async function startWorkout(now: number, routineId?: string, db: GymDB = defaultDb): Promise<Workout> {
  return db.transaction('rw', [db.workouts, db.routineExercises], async () => {
    const active = await getActiveWorkout(db)
    if (active) return active
    const exerciseIds = routineId
      ? (await db.routineExercises.where('[routineId+order]').between([routineId, Dexie.minKey], [routineId, Dexie.maxKey]).toArray()).map((re) => re.exerciseId)
      : []
    const workout: Workout = { id: newId(), routineId, startedAt: now, exerciseIds }
    await db.workouts.add(workout)
    return workout
  })
}

export async function addExerciseToWorkout(workoutId: string, exerciseId: string, db: GymDB = defaultDb): Promise<void> {
  await db.workouts
    .where('id')
    .equals(workoutId)
    .modify((w) => {
      if (!w.exerciseIds.includes(exerciseId)) w.exerciseIds.push(exerciseId)
    })
}

/** Quita el ejercicio del entreno y borra sus series. */
export async function removeExerciseFromWorkout(workoutId: string, exerciseId: string, db: GymDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.workouts, db.sets], async () => {
    await db.workouts
      .where('id')
      .equals(workoutId)
      .modify((w) => {
        w.exerciseIds = w.exerciseIds.filter((id) => id !== exerciseId)
      })
    await db.sets.where('workoutId').equals(workoutId).filter((s) => s.exerciseId === exerciseId).delete()
  })
}

export async function getWorkoutSets(workoutId: string, db: GymDB = defaultDb): Promise<WorkoutSet[]> {
  return db.sets.where('[workoutId+order]').between([workoutId, Dexie.minKey], [workoutId, Dexie.maxKey]).toArray()
}

/** Guarda una serie al momento (así no se pierde nada si se cierra la app). */
export async function addSet(
  workoutId: string,
  exerciseId: string,
  values: { weightKg: number; reps: number; rpe?: number; isWarmup: boolean },
  now: number,
  db: GymDB = defaultDb,
): Promise<WorkoutSet> {
  return db.transaction('rw', db.sets, async () => {
    const last = await db.sets.where('[workoutId+order]').between([workoutId, Dexie.minKey], [workoutId, Dexie.maxKey]).last()
    const set: WorkoutSet = { id: newId(), workoutId, exerciseId, order: (last?.order ?? -1) + 1, performedAt: now, ...values }
    await db.sets.add(set)
    return set
  })
}

export async function deleteSet(setId: string, db: GymDB = defaultDb): Promise<void> {
  await db.sets.delete(setId)
}

/** Series del ejercicio en la sesión más reciente anterior (excluyendo el entreno actual). */
export async function getLastSessionSets(exerciseId: string, excludeWorkoutId: string, db: GymDB = defaultDb): Promise<WorkoutSet[]> {
  const latest = await db.sets
    .where('[exerciseId+performedAt]')
    .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
    .reverse()
    .filter((s) => s.workoutId !== excludeWorkoutId)
    .first()
  if (!latest) return []
  return (await getWorkoutSets(latest.workoutId, db)).filter((s) => s.exerciseId === exerciseId)
}

export async function discardWorkout(workoutId: string, db: GymDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.workouts, db.sets], async () => {
    await db.sets.where('workoutId').equals(workoutId).delete()
    await db.workouts.delete(workoutId)
  })
}

/** Peso más reciente registrado hasta `now` (incluido ese día). */
export async function getBodyweightAt(now: number, db: GymDB = defaultDb): Promise<number | undefined> {
  const log = await db.bodyweightLogs.where('date').belowOrEqual(toDateKey(new Date(now))).last()
  return log?.weightKg
}

/**
 * Termina el entreno: calcula el "Resumen de partida", lo guarda en el workout
 * y persiste los estados de promo. Todo en una transacción.
 */
export async function finishWorkout(workoutId: string, now: number, db: GymDB = defaultDb): Promise<void> {
  await db.transaction(
    'rw',
    [db.workouts, db.sets, db.rankStates, db.exerciseMuscles, db.muscles, db.userProfile, db.bodyweightLogs],
    async () => {
      const workout = await db.workouts.get(workoutId)
      if (!workout || workout.endedAt !== undefined) return

      const [sets, exerciseMuscles, muscles, profile, bodyweightKg, stateRows] = await Promise.all([
        db.sets.toArray(),
        db.exerciseMuscles.toArray(),
        db.muscles.orderBy('id').toArray(),
        db.userProfile.get('me'),
        getBodyweightAt(now, db),
        db.rankStates.toArray(),
      ])
      const rankStates: Record<string, PromotionState> = Object.fromEntries(stateRows.map((r) => [r.id, r.state]))

      const { summary, rankStates: next } = buildWorkoutSummary({
        workout,
        endedAt: now,
        sets,
        exerciseMuscles,
        muscleIds: muscles.sort((a, b) => a.order - b.order).map((m) => m.id),
        sex: profile?.sex,
        bodyweightKg,
        rankStates,
      })

      await db.workouts.update(workoutId, { endedAt: now, summary })
      await db.rankStates.bulkPut(Object.entries(next).map(([id, state]) => ({ id, state })))
    },
  )
}

/** Crea una rutina con los ejercicios del entreno y su nº de series/rango de reps. */
export async function saveWorkoutAsRoutine(workoutId: string, name: string, now: number, db: GymDB = defaultDb): Promise<string> {
  return db.transaction('rw', [db.workouts, db.sets, db.routines, db.routineExercises], async () => {
    const workout = await db.workouts.get(workoutId)
    if (!workout) throw new Error('Entreno no encontrado')
    const sets = (await getWorkoutSets(workoutId, db)).filter((s) => !s.isWarmup)
    const routineId = newId()
    await db.routines.add({ id: routineId, name: name.trim(), createdAt: now })
    const rows: RoutineExercise[] = workout.exerciseIds.map((exerciseId, order) => {
      const reps = sets.filter((s) => s.exerciseId === exerciseId).map((s) => s.reps)
      return {
        id: newId(),
        routineId,
        exerciseId,
        order,
        ...(reps.length ? { targetSets: reps.length, targetRepsMin: Math.min(...reps), targetRepsMax: Math.max(...reps) } : {}),
      }
    })
    await db.routineExercises.bulkAdd(rows)
    await db.workouts.update(workoutId, { routineId })
    return routineId
  })
}

export async function deleteRoutine(routineId: string, db: GymDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.routines, db.routineExercises], async () => {
    await db.routineExercises.where('routineId').equals(routineId).delete()
    await db.routines.delete(routineId)
  })
}

/** Catálogo completo para la UI (nombres de ejercicios y músculos). */
export async function getCatalog(db: GymDB = defaultDb) {
  const [exercises, muscles, exerciseMuscles] = await Promise.all([
    db.exercises.toArray(),
    db.muscles.toArray(),
    db.exerciseMuscles.toArray(),
  ])
  return {
    exercises,
    muscles: muscles.sort((a, b) => a.order - b.order),
    exerciseMuscles,
    exerciseById: new Map(exercises.map((e) => [e.id, e])),
    muscleById: new Map(muscles.map((m) => [m.id, m])),
  }
}
export type Catalog = Awaited<ReturnType<typeof getCatalog>>

/** Rutinas con sus ejercicios en orden. */
export async function listRoutines(db: GymDB = defaultDb) {
  const [routines, rows] = await Promise.all([db.routines.orderBy('createdAt').reverse().toArray(), db.routineExercises.toArray()])
  return routines.map((routine) => ({
    routine,
    exercises: rows.filter((r) => r.routineId === routine.id).sort((a, b) => a.order - b.order),
  }))
}

export async function getRoutineExercises(routineId: string, db: GymDB = defaultDb): Promise<RoutineExercise[]> {
  return db.routineExercises.where('[routineId+order]').between([routineId, Dexie.minKey], [routineId, Dexie.maxKey]).toArray()
}

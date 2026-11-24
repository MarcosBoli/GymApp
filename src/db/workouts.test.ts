import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type GymDB } from './db'
import {
  addExerciseToWorkout,
  addSet,
  deleteRoutine,
  discardWorkout,
  finishWorkout,
  getActiveWorkout,
  getBodyweightAt,
  getLastFinishedWorkout,
  getLastSessionSets,
  getWorkoutSets,
  removeExerciseFromWorkout,
  saveWorkoutAsRoutine,
  startWorkout,
} from './workouts'
import { saveProfile } from './profile'
import { exportAll } from './backup'
import type { ProfileValues } from '../domain/profile'

let n = 0
const opened: GymDB[] = []
const fresh = () => {
  const db = createDb(`wk-${++n}`)
  opened.push(db)
  return db
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete()
})

const T = new Date(2026, 10, 22, 18).getTime()
const profile: ProfileValues = { sex: 'male', birthDate: '1995-01-01', heightCm: 180, weightKg: 80, activityLevel: 'moderate', goal: 'gain', trainingGoal: 'hypertrophy', daysPerWeek: 4, sessionMinutes: 60, equipment: ['barbell', 'dumbbell'], limitations: '', foodDislikes: '', diet: 'omnivora', budget: 'medio', utensils: ['sarten', 'microondas'], maxCookMinutes: 30 }

describe('entreno en curso', () => {
  it('empezar, añadir ejercicios y series; persiste sin terminar', async () => {
    const db = fresh()
    const w = await startWorkout(T, undefined, db)
    expect(await startWorkout(T + 1, undefined, db)).toEqual(w) // solo uno activo
    await addExerciseToWorkout(w.id, 'bench_press', db)
    await addExerciseToWorkout(w.id, 'bench_press', db) // sin duplicados
    await addExerciseToWorkout(w.id, 'back_squat', db)
    await addSet(w.id, 'bench_press', { weightKg: 80, reps: 8, isWarmup: false }, T + 100, db)
    await addSet(w.id, 'back_squat', { weightKg: 100, reps: 5, isWarmup: false, rpe: 8 }, T + 200, db)

    // "reabrir la app": nueva instancia sobre la misma BD
    db.close()
    await db.open()
    const active = await getActiveWorkout(db)
    expect(active?.exerciseIds).toEqual(['bench_press', 'back_squat'])
    const sets = await getWorkoutSets(w.id, db)
    expect(sets.map((s) => [s.exerciseId, s.order])).toEqual([['bench_press', 0], ['back_squat', 1]])
    expect(sets[1]?.rpe).toBe(8)
  })

  it('quitar un ejercicio borra sus series', async () => {
    const db = fresh()
    const w = await startWorkout(T, undefined, db)
    await addExerciseToWorkout(w.id, 'bench_press', db)
    await addSet(w.id, 'bench_press', { weightKg: 80, reps: 8, isWarmup: false }, T, db)
    await removeExerciseFromWorkout(w.id, 'bench_press', db)
    expect((await getActiveWorkout(db))?.exerciseIds).toEqual([])
    expect(await getWorkoutSets(w.id, db)).toEqual([])
  })

  it('descartar borra entreno y series', async () => {
    const db = fresh()
    const w = await startWorkout(T, undefined, db)
    await addSet(w.id, 'bench_press', { weightKg: 80, reps: 8, isWarmup: false }, T, db)
    await discardWorkout(w.id, db)
    expect(await getActiveWorkout(db)).toBeUndefined()
    expect(await db.sets.count()).toBe(0)
  })

  it('series de la última sesión de un ejercicio', async () => {
    const db = fresh()
    const w1 = await startWorkout(T - 3 * 86_400_000, undefined, db)
    await addSet(w1.id, 'bench_press', { weightKg: 80, reps: 8, isWarmup: false }, T - 3 * 86_400_000, db)
    await addSet(w1.id, 'bench_press', { weightKg: 80, reps: 7, isWarmup: false }, T - 3 * 86_400_000 + 1, db)
    await finishWorkout(w1.id, T - 3 * 86_400_000 + 2, db)
    const w2 = await startWorkout(T, undefined, db)
    await addSet(w2.id, 'bench_press', { weightKg: 85, reps: 5, isWarmup: false }, T, db)

    const last = await getLastSessionSets('bench_press', w2.id, db)
    expect(last.map((s) => s.reps)).toEqual([8, 7])
    expect(await getLastSessionSets('back_squat', w2.id, db)).toEqual([])
  })
})

describe('terminar y resumen', () => {
  it('sin perfil: termina con resumen sin rangos', async () => {
    const db = fresh()
    const w = await startWorkout(T, undefined, db)
    await addSet(w.id, 'bench_press', { weightKg: 80, reps: 8, isWarmup: false }, T + 1, db)
    await finishWorkout(w.id, T + 3_600_000, db)
    const done = await db.workouts.get(w.id)
    expect(done?.endedAt).toBe(T + 3_600_000)
    expect(done?.summary).toMatchObject({ ranked: false, workingSets: 1, volumeKg: 640 })
    expect(await getActiveWorkout(db)).toBeUndefined()
    expect(await getLastFinishedWorkout(db)).toMatchObject({ id: w.id })
  })

  it('con perfil: rangos, estados de promo persistidos y sin recalcular al repetir', async () => {
    const db = fresh()
    await saveProfile(profile, T - 86_400_000, db)
    expect(await getBodyweightAt(T, db)).toBe(80)

    const w = await startWorkout(T, undefined, db)
    for (let i = 0; i < 4; i++) await addSet(w.id, 'bench_press', { weightKg: 80, reps: 5, isWarmup: false }, T + i, db)
    await finishWorkout(w.id, T + 3_600_000, db)

    const summary = (await db.workouts.get(w.id))!.summary!
    expect(summary.ranked).toBe(true)
    expect(summary.diffs.map((d) => d.id).sort()).toEqual(['chest', 'front_delts', 'global', 'triceps'])
    expect(await db.rankStates.get('chest')).toMatchObject({ state: { status: 'stable' } })

    await finishWorkout(w.id, T + 9_999_999, db) // ya terminado: no hace nada
    expect((await db.workouts.get(w.id))!.endedAt).toBe(T + 3_600_000)
  })

  it('los estados de promo viajan en el backup', async () => {
    const db = fresh()
    await saveProfile(profile, T, db)
    const w = await startWorkout(T, undefined, db)
    await addSet(w.id, 'back_squat', { weightKg: 100, reps: 5, isWarmup: false }, T + 1, db)
    await finishWorkout(w.id, T + 2, db)
    const backup = await exportAll(new Date(T), db)
    expect(backup.tables.rankStates?.length).toBeGreaterThan(0)
  })
})

describe('rutinas', () => {
  it('guardar entreno como rutina y empezar desde ella', async () => {
    const db = fresh()
    const w = await startWorkout(T, undefined, db)
    await addExerciseToWorkout(w.id, 'bench_press', db)
    await addExerciseToWorkout(w.id, 'lateral_raise', db)
    await addSet(w.id, 'bench_press', { weightKg: 40, reps: 10, isWarmup: true }, T, db)
    await addSet(w.id, 'bench_press', { weightKg: 80, reps: 8, isWarmup: false }, T + 1, db)
    await addSet(w.id, 'bench_press', { weightKg: 80, reps: 6, isWarmup: false }, T + 2, db)
    await finishWorkout(w.id, T + 3, db)

    const routineId = await saveWorkoutAsRoutine(w.id, '  Empuje  ', T + 4, db)
    expect(await db.routines.get(routineId)).toMatchObject({ name: 'Empuje' })
    const res = await db.routineExercises.where('routineId').equals(routineId).sortBy('order')
    expect(res.map((r) => [r.exerciseId, r.targetSets, r.targetRepsMin, r.targetRepsMax])).toEqual([
      ['bench_press', 2, 6, 8],
      ['lateral_raise', undefined, undefined, undefined],
    ])
    expect((await db.workouts.get(w.id))?.routineId).toBe(routineId)

    const w2 = await startWorkout(T + 86_400_000, routineId, db)
    expect(w2).toMatchObject({ routineId, exerciseIds: ['bench_press', 'lateral_raise'] })

    await discardWorkout(w2.id, db)
    await deleteRoutine(routineId, db)
    expect(await db.routines.count()).toBe(0)
    expect(await db.routineExercises.count()).toBe(0)
  })
})

describe('perfil', () => {
  it('guarda perfil y peso del día (sobrescribe el mismo día)', async () => {
    const db = fresh()
    await saveProfile(profile, T, db)
    await saveProfile({ ...profile, weightKg: 79.5 }, T + 1000, db)
    expect(await db.userProfile.get('me')).toMatchObject({ sex: 'male', heightCm: 180, updatedAt: T + 1000 })
    expect(await db.bodyweightLogs.toArray()).toEqual([{ date: '2026-11-22', weightKg: 79.5 }])
    expect(await getBodyweightAt(T - 86_400_000, db)).toBeUndefined()
  })
})

describe('rendimiento: lecturas acotadas', () => {
  it('v3 → v4 añade el índice por fecha sin perder series', async () => {
    const name = `wk-${++n}`
    const { default: Dexie } = await import('dexie')
    const v3 = new Dexie(name)
    v3.version(1).stores({ settings: 'key' })
    v3.version(2).stores({ sets: 'id, workoutId, exerciseId, [workoutId+order], [exerciseId+performedAt]', workouts: 'id, startedAt, routineId', muscles: 'id, group', exercises: 'id, name', exerciseMuscles: '[exerciseId+muscleId], exerciseId, muscleId' })
    v3.version(3).stores({ rankStates: 'id' })
    await v3.table('sets').put({ id: 's1', workoutId: 'w', exerciseId: 'bench_press', order: 0, performedAt: T, reps: 5, weightKg: 100, isWarmup: false })
    v3.close()
    const db = createDb(name)
    opened.push(db)
    expect(await db.sets.where('performedAt').between(T - 1, T + 1).count()).toBe(1)
  })

  it('getActiveWorkout solo mira el último entreno', async () => {
    const db = fresh()
    for (let i = 0; i < 5; i++) {
      const w = await startWorkout(T + i * 86_400_000, undefined, db)
      await addSet(w.id, 'bench_press', { weightKg: 80, reps: 5, isWarmup: false }, T + i * 86_400_000 + 1, db)
      await finishWorkout(w.id, T + i * 86_400_000 + 2, db)
    }
    expect(await getActiveWorkout(db)).toBeUndefined()
    const w = await startWorkout(T + 10 * 86_400_000, undefined, db)
    expect((await getActiveWorkout(db))?.id).toBe(w.id)
  })

  it('finishWorkout: récords contra todo el historial aunque los rangos lean solo 42 días', async () => {
    const db = fresh()
    await saveProfile(profile, T - 300 * 86_400_000, db)
    const old = await startWorkout(T - 200 * 86_400_000, undefined, db)
    await addSet(old.id, 'bench_press', { weightKg: 120, reps: 1, isWarmup: false }, T - 200 * 86_400_000, db)
    await finishWorkout(old.id, T - 200 * 86_400_000 + 1, db)
    const mid = await startWorkout(T - 10 * 86_400_000, undefined, db)
    await addSet(mid.id, 'bench_press', { weightKg: 90, reps: 1, isWarmup: false }, T - 10 * 86_400_000, db)
    await finishWorkout(mid.id, T - 10 * 86_400_000 + 1, db)

    const w = await startWorkout(T, undefined, db)
    await addSet(w.id, 'bench_press', { weightKg: 100, reps: 1, isWarmup: false }, T + 1, db)
    await finishWorkout(w.id, T + 2, db)
    // 100 supera lo de hace 10 días (90) pero no el récord de hace 200 días (120)
    expect((await db.workouts.get(w.id))!.summary!.records).toEqual([])
  })
})

describe('entreno en curso: puntero en settings', () => {
  it('encuentra el entreno en curso aunque haya entrenos con fecha posterior (reloj cambiado, backup de otro móvil)', async () => {
    const db = fresh()
    const future = await startWorkout(T + 5 * 86_400_000, undefined, db)
    await finishWorkout(future.id, T + 5 * 86_400_000 + 1, db)
    const w = await startWorkout(T, undefined, db)
    expect((await getActiveWorkout(db))?.id).toBe(w.id)
    await finishWorkout(w.id, T + 1, db)
    expect(await getActiveWorkout(db)).toBeUndefined()
    const w2 = await startWorkout(T + 2, undefined, db)
    await discardWorkout(w2.id, db)
    expect(await getActiveWorkout(db)).toBeUndefined()
  })

  it('datos sin puntero (versión anterior o backup antiguo): lo encuentra recorriendo', async () => {
    const db = fresh()
    await db.workouts.add({ id: 'legacy', startedAt: T, exerciseIds: [] })
    expect((await getActiveWorkout(db))?.id).toBe('legacy')
  })
})

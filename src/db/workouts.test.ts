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
const profile = { sex: 'male', birthDate: '1995-01-01', heightCm: 180, weightKg: 80, activityLevel: 'moderate', goal: 'gain' } as const

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

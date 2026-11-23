import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type GymDB } from './db'
import { exportAll, getLastBackupAt, importAll, LAST_BACKUP_KEY, markBackupDone } from './backup'
import { parseBackup } from '../domain/backup'
import { newId } from './ids'
import { MUSCLES } from '../data/muscles'
import { buildExerciseCatalog } from '../data/exercises'

let n = 0
const opened: GymDB[] = []
function freshDb(): GymDB {
  const db = createDb(`test-${++n}`)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete()
})

const catalog = buildExerciseCatalog()

describe('seed', () => {
  it('carga el catálogo al crear la BD', async () => {
    const db = freshDb()
    expect(await db.muscles.count()).toBe(MUSCLES.length)
    expect(await db.exercises.count()).toBe(catalog.exercises.length)
    expect(await db.exerciseMuscles.where('muscleId').equals('chest').count()).toBeGreaterThan(5)
  })

  it('no vuelve a sembrar en arranques posteriores', async () => {
    const db = freshDb()
    await db.exercises.delete('bench_press')
    db.close()
    await db.open()
    expect(await db.exercises.get('bench_press')).toBeUndefined()
  })

  it('siembra al actualizar desde la v1 conservando settings', async () => {
    const name = `test-${++n}`
    const v1 = new Dexie(name)
    v1.version(1).stores({ settings: 'key' })
    await v1.table('settings').put({ key: 'units', value: 'kg' })
    v1.close()

    const db = createDb(name)
    opened.push(db)
    expect(await db.muscles.count()).toBe(MUSCLES.length)
    expect(await db.settings.get('units')).toEqual({ key: 'units', value: 'kg' })
  })
})

describe('backup', () => {
  it('exporta e importa todos los datos (ida y vuelta) en otra BD', async () => {
    const src = freshDb()
    await src.userProfile.put({ id: 'me', sex: 'male', birthDate: '2000-01-01', heightCm: 180, activityLevel: 'moderate', goal: 'gain', updatedAt: 1 })
    await src.bodyweightLogs.put({ date: '2026-11-22', weightKg: 80.5 })
    const workoutId = newId()
    await src.workouts.add({ id: workoutId, startedAt: 1, exerciseIds: ['bench_press'] })
    await src.sets.add({ id: newId(), workoutId, exerciseId: 'bench_press', order: 0, performedAt: 2, reps: 5, weightKg: 100, rpe: 8, isWarmup: false })
    await src.foods.add({ id: 'f1', name: 'Arroz', barcode: '123', kcal: 360, proteinG: 7, carbsG: 79, fatG: 1 })
    await markBackupDone(new Date(1000), src)

    const backup = await exportAll(new Date(), src)
    expect(backup.tables.settings).toEqual([]) // la fecha de backup no viaja

    const parsed = parseBackup(JSON.stringify(backup), { tableNames: src.tables.map((t) => t.name), currentVersion: src.verno })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const dst = freshDb()
    await markBackupDone(new Date(5000), dst)
    await importAll(parsed.backup, dst)

    expect(await dst.sets.count()).toBe(1)
    expect(await dst.bodyweightLogs.get('2026-11-22')).toEqual({ date: '2026-11-22', weightKg: 80.5 })
    expect(await dst.foods.where('barcode').equals('123').first()).toMatchObject({ name: 'Arroz' })
    expect(await dst.exercises.count()).toBe(catalog.exercises.length)
    expect(await getLastBackupAt(dst)).toBe(5000) // conserva la del dispositivo
  })

  it('es atómico: si una fila es inválida no se borra nada', async () => {
    const db = freshDb()
    await db.bodyweightLogs.put({ date: '2026-11-22', weightKg: 80 })
    const bad = await exportAll(new Date(), db)
    bad.tables.sets = [{ reps: 5 }] // sin clave primaria

    await expect(importAll(bad, db)).rejects.toThrow()
    expect(await db.bodyweightLogs.count()).toBe(1)
  })

  it('re-siembra el catálogo si el backup no lo trae', async () => {
    const db = freshDb()
    await importAll({ app: 'gymapp', schemaVersion: 2, exportedAt: '', tables: {} }, db)
    expect(await db.muscles.count()).toBe(MUSCLES.length)
    expect(await db.settings.get(LAST_BACKUP_KEY)).toBeUndefined()
  })
})

describe('newId', () => {
  it('genera UUID v4 únicos', () => {
    const ids = new Set(Array.from({ length: 100 }, newId))
    expect(ids.size).toBe(100)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('v8: escalera de 6 tiers', () => {
  // Rango guardado con la escalera antigua (9 tiers, divisiones IV-I)
  const oldRank = (score: number) => ({ tierIndex: 3, tierId: 'gold', tierName: 'Oro', division: 'IV', lp: 50, score })
  const oldSummary = {
    ranked: true,
    durationMs: 1,
    sets: 1,
    volumeKg: 1,
    diffs: [{ id: 'chest', before: oldRank(37.5), after: oldRank(48), lpDelta: 150, change: 'promoted' }],
    promotions: [{ id: 'chest', kind: 'started', state: { status: 'promo', tierIndex: 3, targetTierIndex: 4, wins: 0, losses: 0 } }],
    records: [],
  }
  const V7_STORES = {
    settings: 'key',
    userProfile: 'id',
    bodyweightLogs: 'date',
    muscles: 'id, group',
    exercises: 'id, name',
    exerciseMuscles: '[exerciseId+muscleId], exerciseId, muscleId',
    routines: 'id, createdAt',
    routineExercises: 'id, routineId, exerciseId, [routineId+order]',
    workouts: 'id, startedAt, routineId',
    sets: 'id, workoutId, exerciseId, performedAt, [workoutId+order], [exerciseId+performedAt]',
    foods: 'id, name, &barcode',
    meals: 'id, date, [date+type]',
    mealItems: 'id, mealId, foodId, date',
    rankStates: 'id',
    weeklyPlans: 'id, weekStart, [weekStart+createdAt]',
    weekFeedback: 'weekStart',
    chatMessages: 'id, [threadKey+createdAt]',
  }

  it('al actualizar desde la v7 recalcula los resúmenes y descarta las promos antiguas', async () => {
    const name = `test-${++n}`
    const v7 = new Dexie(name)
    v7.version(7).stores(V7_STORES)
    await v7.table('workouts').bulkAdd([
      { id: 'w1', startedAt: 1, endedAt: 2, exerciseIds: [], summary: oldSummary },
      { id: 'w2', startedAt: 3, exerciseIds: [] }, // en curso, sin resumen
    ])
    await v7.table('rankStates').put({ id: 'chest', state: { status: 'stable', tierIndex: 7 } })
    v7.close()

    const db = createDb(name)
    opened.push(db)
    const w1 = await db.workouts.get('w1')
    expect(w1!.summary!.diffs[0]).toMatchObject({
      before: { tierName: 'Aprendiz', division: 'II' },
      after: { tierName: 'Atleta', division: 'III' },
      change: 'promoted',
    })
    expect(w1!.summary!.promotions).toEqual([])
    expect((await db.workouts.get('w2'))!.summary).toBeUndefined()
    expect(await db.rankStates.count()).toBe(0)
  })

  it('importar un backup antiguo aplica la misma conversión; uno nuevo no se toca', async () => {
    const db = freshDb()
    const tables = {
      workouts: [{ id: 'w1', startedAt: 1, endedAt: 2, exerciseIds: [], summary: oldSummary }],
      rankStates: [{ id: 'chest', state: { status: 'stable', tierIndex: 7 } }],
    }
    await importAll({ app: 'gymapp', schemaVersion: 7, exportedAt: '', tables }, db)
    expect((await db.workouts.get('w1'))!.summary!.diffs[0]!.after).toMatchObject({ tierName: 'Atleta' })
    expect(await db.rankStates.count()).toBe(0)

    const current = { workouts: [{ id: 'w1', startedAt: 1, endedAt: 2, exerciseIds: [], summary: { ...oldSummary, promotions: [] } }], rankStates: [{ id: 'chest', state: { status: 'stable', tierIndex: 2 } }] }
    await importAll({ app: 'gymapp', schemaVersion: 8, exportedAt: '', tables: current }, db)
    expect(await db.rankStates.get('chest')).toEqual({ id: 'chest', state: { status: 'stable', tierIndex: 2 } })
  })
})

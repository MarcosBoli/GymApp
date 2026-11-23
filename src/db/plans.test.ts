import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type GymDB } from './db'
import { editPlanDays, getActivePlan, getCoachInputs, getWeekWorkouts, listPlanVersions, saveWeekFeedback, savePlanVersion, weekHadActivity } from './plans'
import { addSet, finishWorkout, startWorkout } from './workouts'
import { exportAll } from './backup'
import type { PlanDay } from '../domain/types'

let n = 0
const opened: GymDB[] = []
const fresh = () => {
  const db = createDb(`plan-${++n}`)
  opened.push(db)
  return db
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete()
})

const MON = new Date(2026, 10, 23, 10).getTime()
const days: PlanDay[] = [
  { dayIndex: 0, name: 'Torso', exercises: [{ exerciseId: 'bench_press', sets: 3, repsMin: 6, repsMax: 10, rpeTarget: 8, notes: '' }, { exerciseId: 'barbell_row', sets: 3, repsMin: 8, repsMax: 12, rpeTarget: 8, notes: '' }] },
  { dayIndex: 3, name: 'Pierna', exercises: [{ exerciseId: 'back_squat', sets: 4, repsMin: 5, repsMax: 8, rpeTarget: 8, notes: '' }] },
]
const base = { weekStart: '2026-11-23', source: 'ai' as const, days, reasoning: 'r' }

describe('planes semanales con historial', () => {
  it('regenerar o editar crea versión nueva y conserva la anterior', async () => {
    const db = fresh()
    const v1 = await savePlanVersion(base, MON, db)
    const v2 = await savePlanVersion({ ...base, reasoning: 'regenerado' }, MON + 1, db)
    expect((await getActivePlan('2026-11-23', db))?.id).toBe(v2.id)
    const v3 = await editPlanDays(v2.id, [days[1]!], MON + 2, db)
    expect(v3).toMatchObject({ source: 'manual', reasoning: 'regenerado', status: 'active' })
    expect((await getActivePlan('2026-11-23', db))?.days).toHaveLength(1)
    const versions = await listPlanVersions('2026-11-23', db)
    expect(versions.map((p) => [p.id, p.status])).toEqual([[v3.id, 'active'], [v2.id, 'superseded'], [v1.id, 'superseded']])
    expect(await getActivePlan('2026-11-30', db)).toBeUndefined()
  })

  it('empezar un entreno desde un día del plan', async () => {
    const db = fresh()
    const plan = await savePlanVersion(base, MON, db)
    const w = await startWorkout(MON, undefined, db, { planId: plan.id, dayIndex: 0 })
    expect(w).toMatchObject({ planId: plan.id, planDayIndex: 0, exerciseIds: ['bench_press', 'barbell_row'] })
    await addSet(w.id, 'bench_press', { weightKg: 80, reps: 8, isWarmup: false }, MON + 1, db)
    await finishWorkout(w.id, MON + 2, db)
    expect((await getWeekWorkouts('2026-11-23', db)).map((x) => x.planDayIndex)).toEqual([0])
    expect(await getWeekWorkouts('2026-11-30', db)).toEqual([])
  })

  it('valoración, actividad de la semana y entradas del contexto', async () => {
    const db = fresh()
    expect(await weekHadActivity('2026-11-16', db)).toBe(false)
    const prev = await savePlanVersion({ ...base, weekStart: '2026-11-16' }, MON - 7 * 86_400_000, db)
    expect(await weekHadActivity('2026-11-16', db)).toBe(true)
    await saveWeekFeedback('2026-11-16', 'hard', MON, db)
    const inputs = await getCoachInputs('2026-11-23', MON, db)
    expect(inputs.previousWeek.plan?.id).toBe(prev.id)
    expect(inputs.previousWeek.feedback?.rating).toBe('hard')
  })

  it('planes y valoraciones viajan en el backup', async () => {
    const db = fresh()
    await savePlanVersion(base, MON, db)
    await saveWeekFeedback('2026-11-16', 'easy', MON, db)
    const b = await exportAll(new Date(MON), db)
    expect(b.tables.weeklyPlans).toHaveLength(1)
    expect(b.tables.weekFeedback).toHaveLength(1)
  })
})

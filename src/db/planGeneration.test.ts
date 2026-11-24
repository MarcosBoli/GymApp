import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDb, type GymDB } from './db'
import { buildPlanRequest, generateWeekPlan, getRecentE1RMs, MissingTrainingPrefsError } from './planGeneration'
import { getActivePlan, saveWeekFeedback } from './plans'
import { saveProfile } from './profile'
import { addSet, finishWorkout, startWorkout } from './workouts'
import { PlanRequestSchema, type PlanOutput } from '../domain/planSchema'
import type { ProfileValues } from '../domain/profile'

let n = 0
const opened: GymDB[] = []
const fresh = () => {
  const db = createDb(`gen-${++n}`)
  opened.push(db)
  return db
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete()
})

const NOW = new Date(2026, 10, 23, 10).getTime()
const profile: ProfileValues = {
  sex: 'male', birthDate: '1995-05-10', heightCm: 180, weightKg: 80, activityLevel: 'moderate', goal: 'gain',
  trainingGoal: 'strength', daysPerWeek: 3, sessionMinutes: 60, equipment: ['barbell'], limitations: 'Lumbar delicada',
  foodDislikes: '', diet: 'omnivora', budget: 'medio', utensils: ['sarten'], maxCookMinutes: 30,
}

const output: PlanOutput = {
  reasoning: ' Fuerza básica. ',
  days: [4, 0, 2].map((dayIndex) => ({ dayIndex, name: `D${dayIndex}`, exercises: [{ exerciseId: 'back_squat', sets: 5, repsMin: 3, repsMax: 5, rpeTarget: 8, notes: '' }] })),
}

describe('generar la semana', () => {
  it('sin preferencias de entrenamiento → error claro', async () => {
    const db = fresh()
    await expect(buildPlanRequest('2026-11-23', NOW, db)).rejects.toBeInstanceOf(MissingTrainingPrefsError)
  })

  it('arma una petición válida (contexto + catálogo filtrado por material)', async () => {
    const db = fresh()
    await saveProfile(profile, NOW - 30 * 86_400_000, db)
    const w = await startWorkout(NOW - 3 * 86_400_000, undefined, db)
    await addSet(w.id, 'bench_press', { weightKg: 80, reps: 5, isWarmup: false }, NOW - 3 * 86_400_000, db)
    await finishWorkout(w.id, NOW - 3 * 86_400_000 + 1, db)
    await saveWeekFeedback('2026-11-16', 'easy', NOW, db)

    const req = await buildPlanRequest('2026-11-23', NOW, db)
    expect(PlanRequestSchema.safeParse(req).success).toBe(true)
    expect(req.context.profile).toMatchObject({ trainingGoal: 'strength', daysPerWeek: 3, equipment: ['barbell'], limitations: 'Lumbar delicada', weightKg: 80 })
    expect(req.context.lastWeek).toEqual({ planned: null, completed: 1, adherence: 0.33, rating: 'easy' })
    expect(req.catalog.every((c) => c.equipment === 'barbell' || c.equipment === 'bodyweight')).toBe(true)
    expect(req.context.muscles.find((m) => m.id === 'chest')?.daysSinceLast).toBe(3)
    expect(JSON.stringify(req).length).toBeLessThan(20_000)
  })

  it('guarda el plan de la IA como versión activa, días ordenados', async () => {
    const db = fresh()
    await saveProfile(profile, NOW, db)
    const requestPlan = vi.fn().mockResolvedValue({ plan: output, model: 'claude-sonnet-5-5' })
    const plan = await generateWeekPlan('2026-11-23', NOW, requestPlan, db)
    expect(requestPlan).toHaveBeenCalledOnce()
    expect(plan).toMatchObject({ weekStart: '2026-11-23', source: 'ai', reasoning: 'Fuerza básica.', model: 'claude-sonnet-5-5', status: 'active' })
    expect(plan.days.map((d) => d.dayIndex)).toEqual([0, 2, 4])
    expect((await getActivePlan('2026-11-23', db))?.id).toBe(plan.id)
  })

  it('si la IA falla no se guarda nada', async () => {
    const db = fresh()
    await saveProfile(profile, NOW, db)
    await expect(generateWeekPlan('2026-11-23', NOW, vi.fn().mockRejectedValue(new Error('timeout')), db)).rejects.toThrow('timeout')
    expect(await db.weeklyPlans.count()).toBe(0)
  })

  it('e1RM recientes para el peso sugerido', async () => {
    const db = fresh()
    const w = await startWorkout(NOW - 86_400_000, undefined, db)
    await addSet(w.id, 'back_squat', { weightKg: 100, reps: 5, isWarmup: false }, NOW - 86_400_000, db)
    await addSet(w.id, 'pull_up', { weightKg: 10, reps: 1, isWarmup: false }, NOW - 86_400_000, db)
    const m = await getRecentE1RMs(['back_squat', 'pull_up', 'bench_press'], NOW, 80, db)
    expect(m.get('back_squat')).toBeCloseTo(100 * (1 + 5 / 30))
    expect(m.get('pull_up')).toBe(90)
    expect(m.has('bench_press')).toBe(false)
  })
})

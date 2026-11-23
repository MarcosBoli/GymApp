import { describe, expect, it } from 'vitest'
import { averageWeeklySets, buildCoachContext, e1rmTrend4w, trainingPrefs } from './coachContext'
import { CoachContextSchema } from './planSchema'
import { buildRankOverview } from './progress'
import { DAY_MS, type RankedSet } from './ranking'
import type { ExerciseMuscle, UserProfile, WeeklyPlan } from './types'

const NOW = new Date(2026, 10, 23, 9).getTime() // lunes
const daysAgo = (d: number) => NOW - d * DAY_MS
let n = 0
const set = (exerciseId: string, weightKg: number, reps: number, at: number, isWarmup = false): RankedSet => ({ id: `s${++n}`, exerciseId, weightKg, reps, performedAt: at, isWarmup })

const EM: ExerciseMuscle[] = [
  { exerciseId: 'bench_press', muscleId: 'chest', factor: 1 },
  { exerciseId: 'bench_press', muscleId: 'triceps', factor: 0.5 },
  { exerciseId: 'pec_deck', muscleId: 'chest', factor: 1 },
  { exerciseId: 'back_squat', muscleId: 'quads', factor: 1 },
]

const profile: UserProfile = {
  id: 'me', sex: 'male', birthDate: '1995-06-15', heightCm: 180, activityLevel: 'moderate', goal: 'gain',
  trainingGoal: 'hypertrophy', daysPerWeek: 4, sessionMinutes: 60, equipment: ['barbell', 'dumbbell'], limitations: '  Molestia en hombro derecho  ', updatedAt: 1,
}

describe('trainingPrefs', () => {
  it('completas o null si falta algo', () => {
    expect(trainingPrefs(profile)).toEqual({ trainingGoal: 'hypertrophy', daysPerWeek: 4, sessionMinutes: 60, equipment: ['barbell', 'dumbbell'], limitations: 'Molestia en hombro derecho' })
    expect(trainingPrefs({ ...profile, equipment: [] })).toBeNull()
    expect(trainingPrefs({ ...profile, trainingGoal: undefined })).toBeNull()
    expect(trainingPrefs(undefined)).toBeNull()
  })
})

describe('e1rmTrend4w', () => {
  it('% de cambio del mejor e1RM: últimas 2 semanas frente a las 2 anteriores', () => {
    const sets = [set('bench_press', 100, 1, daysAgo(20)), set('bench_press', 105, 1, daysAgo(3)), set('bench_press', 200, 1, daysAgo(40))]
    expect(e1rmTrend4w('chest', sets, EM, NOW)).toBe(5)
  })

  it('media ponderada de los ejercicios principales con datos en ambas mitades', () => {
    const sets = [
      set('bench_press', 100, 1, daysAgo(20)), set('bench_press', 110, 1, daysAgo(2)), // +10 %
      set('pec_deck', 50, 1, daysAgo(18)), set('pec_deck', 50, 1, daysAgo(5)), // 0 %
      set('back_squat', 100, 1, daysAgo(2)), // solo reciente: no cuenta
    ]
    expect(e1rmTrend4w('chest', sets, EM, NOW)).toBe(5)
    expect(e1rmTrend4w('quads', sets, EM, NOW)).toBeNull()
    expect(e1rmTrend4w('triceps', sets, EM, NOW)).toBeNull() // secundario: no cuenta
  })

  it('ignora calentamientos y estancamiento da 0', () => {
    const sets = [set('bench_press', 100, 5, daysAgo(20)), set('bench_press', 100, 5, daysAgo(2)), set('bench_press', 140, 5, daysAgo(2), true)]
    expect(e1rmTrend4w('chest', sets, EM, NOW)).toBe(0)
  })
})

describe('averageWeeklySets', () => {
  it('media de 4 semanas con factor', () => {
    const sets = [...Array.from({ length: 12 }, (_, i) => set('bench_press', 80, 8, daysAgo(i * 2))), set('bench_press', 80, 8, daysAgo(30)), set('bench_press', 40, 10, daysAgo(1), true)]
    expect(averageWeeklySets('chest', sets, EM, NOW)).toBe(3)
    expect(averageWeeklySets('triceps', sets, EM, NOW)).toBe(1.5)
    expect(averageWeeklySets('quads', sets, EM, NOW)).toBe(0)
  })
})

describe('buildCoachContext', () => {
  const muscles = [{ id: 'chest', name: 'Pecho' }, { id: 'triceps', name: 'Tríceps' }, { id: 'quads', name: 'Cuádriceps' }]
  const sets = [
    ...Array.from({ length: 6 }, (_, i) => set('bench_press', 90, 5, daysAgo(i + 1))),
    set('bench_press', 85, 5, daysAgo(20)),
    ...Array.from({ length: 4 }, () => set('back_squat', 80, 5, daysAgo(10))),
  ]
  const overview = buildRankOverview({ sets, exerciseMuscles: EM, muscles, bodyweightKg: 80, sex: 'male', now: NOW, rankStates: {} })
  const prevPlan: WeeklyPlan = { id: 'pp', weekStart: '2026-11-16', createdAt: 1, status: 'active', source: 'ai', reasoning: '', days: [0, 2, 4, 5].map((dayIndex) => ({ dayIndex, name: 'X', exercises: [] })) }

  const ctx = buildCoachContext({
    weekStart: '2026-11-23', today: '2026-11-23', now: NOW, profile, prefs: trainingPrefs(profile)!, bodyweightKg: 80, overview, sets, exerciseMuscles: EM,
    previousWeek: { plan: prevPlan, workouts: [{ planId: 'pp', planDayIndex: 0, endedAt: 1 }, { planId: 'pp', planDayIndex: 2, endedAt: 1 }, { planId: 'pp', planDayIndex: 4, endedAt: 1 }], feedback: { weekStart: '2026-11-16', rating: 'hard', createdAt: 1 } },
  })

  it('cumple el esquema que valida el servidor', () => {
    expect(CoachContextSchema.parse(ctx)).toEqual(ctx)
  })

  it('perfil con edad, peso, preferencias y limitaciones', () => {
    expect(ctx.profile).toEqual({ sex: 'male', age: 31, heightCm: 180, weightKg: 80, trainingGoal: 'hypertrophy', daysPerWeek: 4, sessionMinutes: 60, equipment: ['barbell', 'dumbbell'], limitations: 'Molestia en hombro derecho' })
  })

  it('por músculo: rango, LP, tendencia, series y días desde el último', () => {
    const chest = ctx.muscles.find((m) => m.id === 'chest')!
    expect(chest.rank).toMatch(/^(Novato|Aprendiz|Atleta|Veterano|Élite|Titán) (III|II|I)$/)
    expect(chest.e1rmTrend4wPct).toBeCloseTo(5.9, 1) // 85×5 → 90×5
    expect(chest.weeklySets).toBe(1.8) // 7 series / 4
    expect(chest.daysSinceLast).toBe(1)
    expect(ctx.muscles.find((m) => m.id === 'quads')!.daysSinceLast).toBe(10)
  })

  it('eslabón débil y semana anterior (adherencia + valoración)', () => {
    expect(ctx.weakLink?.id).toBe(overview.weakLink?.muscleId)
    expect(ctx.lastWeek).toEqual({ planned: 4, completed: 3, adherence: 0.75, rating: 'hard' })
  })

  it('cabe holgadamente en el límite de la petición', () => {
    expect(JSON.stringify(ctx).length).toBeLessThan(8000)
  })
})

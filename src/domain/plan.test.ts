import { describe, expect, it } from 'vitest'
import {
  addPlanExercise,
  buildCatalog,
  completedDayIndexes,
  dayToTrain,
  equivalentExercises,
  formatPlanTarget,
  planErrors,
  removePlanExercise,
  suggestWeight,
  swapExercise,
  toPlanDays,
  updatePlanExercise,
  weekAdherence,
  weekToRate,
} from './plan'
import { planOutputSchema, PlanRequestSchema, type PlanOutput } from './planSchema'
import { weekdayIndex } from './dates'
import type { Exercise, ExerciseMuscle, PlanDay, WeeklyPlan } from './types'
import { EXERCISES, buildExerciseCatalog } from '../data/exercises'
import { MUSCLES } from '../data/muscles'

const { exercises, exerciseMuscles } = buildExerciseCatalog()

const day = (dayIndex: number, ids: string[]): PlanDay => ({
  dayIndex,
  name: `Día ${dayIndex}`,
  exercises: ids.map((exerciseId) => ({ exerciseId, sets: 3, repsMin: 8, repsMax: 10, rpeTarget: 8, notes: '' })),
})
const plan = (days: PlanDay[], id = 'p1'): WeeklyPlan => ({ id, weekStart: '2026-11-23', createdAt: 1, status: 'active', source: 'ai', days, reasoning: '' })

describe('weekdayIndex', () => {
  it('lunes = 0 … domingo = 6', () => {
    expect(['2026-11-23', '2026-11-25', '2026-11-29'].map(weekdayIndex)).toEqual([0, 2, 6])
  })
})

describe('buildCatalog', () => {
  it('solo material disponible (+ peso corporal), con músculos por nombre', () => {
    const c = buildCatalog(exercises, exerciseMuscles, [...MUSCLES], ['dumbbell'])
    expect(c.every((e) => e.equipment === 'dumbbell' || e.equipment === 'bodyweight')).toBe(true)
    const db = c.find((e) => e.id === 'db_bench_press')!
    expect(db).toMatchObject({ id: 'db_bench_press', name: 'Press de banca con mancuernas', equipment: 'dumbbell', primary: ['Pecho'] })
    expect([...db.secondary].sort()).toEqual(['Hombro anterior', 'Tríceps'])
    expect(c.some((e) => e.id === 'bench_press')).toBe(false)
    expect(c.some((e) => e.id === 'pull_up')).toBe(true)
  })
})

describe('planErrors / toPlanDays', () => {
  const ids = new Set(EXERCISES.map((e) => e.id))
  const out = (days: PlanOutput['days']): PlanOutput => ({ reasoning: 'r', days })
  const ok = out([
    { dayIndex: 3, name: 'B', exercises: [{ exerciseId: 'back_squat', sets: 3, repsMin: 5, repsMax: 8, rpeTarget: 8, notes: ' ' }] },
    { dayIndex: 0, name: 'A', exercises: [{ exerciseId: 'bench_press', sets: 3, repsMin: 6, repsMax: 10, rpeTarget: 8, notes: '' }] },
  ])

  it('plan válido → sin errores; días ordenados y notas recortadas', () => {
    expect(planErrors(ok, ids, 2)).toEqual([])
    expect(toPlanDays(ok).map((d) => d.dayIndex)).toEqual([0, 3])
    expect(toPlanDays(ok)[1]!.exercises[0]!.notes).toBe('')
  })

  it('detecta ids inexistentes, días repetidos, número de días, reps invertidas y repetidos', () => {
    const bad = out([
      { dayIndex: 0, name: 'A', exercises: [{ exerciseId: 'press_inventado', sets: 3, repsMin: 10, repsMax: 6, rpeTarget: 8, notes: '' }, { exerciseId: 'bench_press', sets: 3, repsMin: 6, repsMax: 8, rpeTarget: 8, notes: '' }, { exerciseId: 'bench_press', sets: 3, repsMin: 6, repsMax: 8, rpeTarget: 8, notes: '' }] },
      { dayIndex: 0, name: 'B', exercises: [{ exerciseId: 'back_squat', sets: 3, repsMin: 5, repsMax: 8, rpeTarget: 8, notes: '' }] },
    ])
    const e = planErrors(bad, ids, 3)
    expect(e.join('\n')).toContain('press_inventado')
    expect(e.join('\n')).toContain('repetidos (dayIndex')
    expect(e.join('\n')).toContain('3 días por semana y el plan tiene 2')
    expect(e.join('\n')).toContain('repsMin (10) mayor que repsMax (6)')
    expect(e.join('\n')).toContain('ejercicios repetidos en el mismo día')
  })

  it('el esquema de salida restringe exerciseId al catálogo', () => {
    const schema = planOutputSchema(['bench_press', 'back_squat'])
    expect(schema.safeParse(ok).success).toBe(true)
    expect(schema.safeParse(out([{ dayIndex: 0, name: 'A', exercises: [{ exerciseId: 'otro', sets: 3, repsMin: 5, repsMax: 8, rpeTarget: 8, notes: '' }] }])).success).toBe(false)
    expect(schema.safeParse(out([{ dayIndex: 9, name: 'A', exercises: [{ exerciseId: 'bench_press', sets: 3, repsMin: 5, repsMax: 8, rpeTarget: 8, notes: '' }] }])).success).toBe(false)
  })

  it('el esquema de petición rechaza contextos mal formados', () => {
    expect(PlanRequestSchema.safeParse({ context: {}, catalog: [] }).success).toBe(false)
  })
})

describe('suggestWeight', () => {
  it('Epley inverso con reps centrales + RIR, redondeado al incremento', () => {
    // e1RM 100, 8-10 reps (9) @ RPE 8 (RIR 2) → 100 / (1 + 11/30) = 73,2 → 72,5 con barra
    expect(suggestWeight(100, { repsMin: 8, repsMax: 10, rpeTarget: 8 }, 'barbell')).toBe(72.5)
    // mancuernas: incrementos de 2 kg → 73,2 → 74
    expect(suggestWeight(100, { repsMin: 8, repsMax: 10, rpeTarget: 8 }, 'dumbbell')).toBe(74)
    // RPE 10 = sin reserva
    expect(suggestWeight(100, { repsMin: 5, repsMax: 5, rpeTarget: 10 }, 'barbell')).toBe(85)
  })

  it('peso corporal: lastre sobre el propio peso (0 si no hace falta)', () => {
    // e1RM total 110 con 80 kg, 6-8 (7) @ RPE 8 → 110/1,3 = 84,6 → lastre 4,6 → 2,5 (hacia abajo)
    expect(suggestWeight(110, { repsMin: 6, repsMax: 8, rpeTarget: 8 }, 'bodyweight', 80)).toBe(2.5)
    expect(suggestWeight(90, { repsMin: 8, repsMax: 12, rpeTarget: 8 }, 'bodyweight', 80)).toBe(0)
    expect(suggestWeight(90, { repsMin: 8, repsMax: 12, rpeTarget: 8 }, 'bodyweight')).toBeNull()
  })

  it('sin e1RM → null', () => {
    expect(suggestWeight(undefined, { repsMin: 8, repsMax: 10, rpeTarget: 8 }, 'barbell')).toBeNull()
  })

  it('formatPlanTarget', () => {
    expect(formatPlanTarget({ sets: 3, repsMin: 8, repsMax: 10, rpeTarget: 7.5 }, 72.5)).toBe('3 × 8-10 @ RPE 7,5 · 72,5 kg')
    expect(formatPlanTarget({ sets: 5, repsMin: 5, repsMax: 5, rpeTarget: 8 })).toBe('5 × 5 @ RPE 8')
  })
})

describe('semana', () => {
  const p = plan([day(0, ['bench_press']), day(2, ['back_squat']), day(4, ['deadlift'])])
  const w = (planDayIndex: number, planId = 'p1') => ({ planId, planDayIndex, endedAt: 1 as number | undefined })
  const inProgress = (planDayIndex: number) => ({ ...w(planDayIndex), endedAt: undefined })

  it('días hechos: solo entrenos terminados de este plan', () => {
    expect([...completedDayIndexes(p, [w(0), inProgress(2), w(4, 'otro')])]).toEqual([0])
  })

  it('día que toca: hoy si está pendiente; si no, el primero pendiente', () => {
    expect(dayToTrain(p, '2026-11-25', new Set())!.dayIndex).toBe(2) // miércoles
    expect(dayToTrain(p, '2026-11-25', new Set([2]))!.dayIndex).toBe(0) // recupera el lunes
    expect(dayToTrain(p, '2026-11-24', new Set([0]))!.dayIndex).toBe(2) // martes sin plan → siguiente pendiente
    expect(dayToTrain(p, '2026-11-29', new Set([0, 2, 4]))).toBeNull()
  })

  it('adherencia con y sin plan', () => {
    expect(weekAdherence(p, [w(0), w(2), w(2)], 3)).toEqual({ planned: 3, completed: 2, adherence: 2 / 3 })
    expect(weekAdherence(undefined, [w(0, 'x'), w(1, 'x')], 4)).toEqual({ planned: null, completed: 2, adherence: 0.5 })
    expect(weekAdherence(undefined, [], 4)).toEqual({ planned: null, completed: 0, adherence: null })
  })

  it('qué semana valorar', () => {
    const base = { currentWeekStart: '2026-11-23', feedback: [], previousWeekHadActivity: true }
    expect(weekToRate({ ...base, today: '2026-11-29', currentPlan: p })).toBe('2026-11-23') // domingo
    expect(weekToRate({ ...base, today: '2026-11-28', currentPlan: p })).toBeNull() // sábado
    expect(weekToRate({ ...base, today: '2026-11-29' })).toBeNull() // sin plan
    expect(weekToRate({ ...base, today: '2026-11-29', currentPlan: p, feedback: [{ weekStart: '2026-11-23', rating: 'ok', createdAt: 1 }] })).toBeNull()
    expect(weekToRate({ ...base, today: '2026-11-23', generating: true })).toBe('2026-11-16') // al generar, la anterior
    expect(weekToRate({ ...base, today: '2026-11-23', generating: true, previousWeekHadActivity: false })).toBeNull()
  })
})

describe('edición del plan', () => {
  const days = [day(0, ['bench_press', 'lateral_raise']), day(3, ['back_squat'])]

  it('alternativas equivalentes: mismos músculos principales y material disponible', () => {
    const alt = equivalentExercises('bench_press', exercises, exerciseMuscles, ['barbell', 'dumbbell', 'machine', 'cable']).map((e) => e.id)
    expect(alt.slice(0, 3)).toEqual(expect.arrayContaining(['incline_bench_press']))
    expect(alt).toContain('db_bench_press')
    expect(alt).not.toContain('bench_press')
    expect(alt).not.toContain('back_squat')
    const onlyDb = equivalentExercises('bench_press', exercises, exerciseMuscles, ['dumbbell'])
    expect(onlyDb.every((e) => e.equipment === 'dumbbell' || e.equipment === 'bodyweight')).toBe(true)
  })

  it('el mismo material desempata', () => {
    const ex: Exercise[] = [
      { id: 'a', name: 'A', equipment: 'barbell', isCustom: false },
      { id: 'b', name: 'B', equipment: 'dumbbell', isCustom: false },
      { id: 'c', name: 'C', equipment: 'barbell', isCustom: false },
    ]
    const em: ExerciseMuscle[] = ['a', 'b', 'c'].map((id) => ({ exerciseId: id, muscleId: 'chest', factor: 1 }))
    expect(equivalentExercises('a', ex, em, ['barbell', 'dumbbell']).map((e) => e.id)).toEqual(['c', 'b'])
  })

  it('cambiar, editar, quitar y añadir', () => {
    expect(swapExercise(days, 0, 0, 'db_bench_press')[0]!.exercises[0]).toMatchObject({ exerciseId: 'db_bench_press', sets: 3, repsMin: 8 })
    const edited = updatePlanExercise(days, 0, 1, { repsMin: 15 })
    expect(edited[0]!.exercises[1]).toMatchObject({ repsMin: 15, repsMax: 15 })
    expect(updatePlanExercise(days, 0, 1, { repsMax: 4 })[0]!.exercises[1]).toMatchObject({ repsMin: 4, repsMax: 4 })
    expect(updatePlanExercise(days, 0, 0, { sets: 20, rpeTarget: 7.3 })[0]!.exercises[0]).toMatchObject({ sets: 8, rpeTarget: 7.5 })
    expect(removePlanExercise(days, 0, 0)[0]!.exercises.map((e) => e.exerciseId)).toEqual(['lateral_raise'])
    expect(addPlanExercise(days, 3, 'leg_curl')[1]!.exercises.at(-1)).toEqual({ exerciseId: 'leg_curl', sets: 3, repsMin: 8, repsMax: 12, rpeTarget: 8, notes: '' })
    expect(days[0]!.exercises[0]!.exerciseId).toBe('bench_press') // inmutable
  })
})

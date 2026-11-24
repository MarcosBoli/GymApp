import { describe, expect, it } from 'vitest'
import {
  buildExerciseIndex,
  exerciseMuscleNames,
  findPersonalRecords,
  formatRoutineTarget,
  formatSetsLine,
  normalizeText,
  parseSetInput,
  searchExercises,
  setLabels,
  suggestNextSet,
  suggestPlannedSet,
  workoutStats,
} from './workout'

const w = (weightKg: number, reps: number, isWarmup = false) => ({ weightKg, reps, isWarmup })

describe('suggestNextSet', () => {
  const last = [w(40, 10, true), w(80, 8), w(80, 7), w(75, 9)]

  it('primera serie: la primera de trabajo de la última sesión', () => {
    expect(suggestNextSet(last, [])).toEqual({ weightKg: 80, reps: 8 })
  })

  it('serie N: la serie N de la última sesión (ignorando calentamientos)', () => {
    expect(suggestNextSet(last, [w(40, 10, true), w(82.5, 8)])).toEqual({ weightKg: 80, reps: 7 })
    expect(suggestNextSet(last, [w(80, 8), w(80, 8)])).toEqual({ weightKg: 75, reps: 9 })
  })

  it('más series que la última vez: repite la última de hoy', () => {
    expect(suggestNextSet(last, [w(80, 8), w(80, 8), w(77.5, 9)])).toEqual({ weightKg: 77.5, reps: 9 })
  })

  it('sin historial: repite la última de hoy o nada', () => {
    expect(suggestNextSet([], [w(60, 12)])).toEqual({ weightKg: 60, reps: 12 })
    expect(suggestNextSet([], [])).toBeNull()
    expect(suggestNextSet([w(20, 10, true)], [w(20, 10, true)])).toBeNull()
  })
})

describe('formatSetsLine', () => {
  it('solo series de trabajo con coma decimal', () => {
    expect(formatSetsLine([w(40, 10, true), w(82.5, 8), w(80, 7)])).toBe('82,5 × 8 · 80 × 7')
    expect(formatSetsLine([])).toBe('')
  })
})

describe('parseSetInput', () => {
  it('acepta coma decimal y RPE opcional', () => {
    expect(parseSetInput({ weight: '82,5', reps: '8' })).toEqual({ ok: true, value: { weightKg: 82.5, reps: 8 } })
    expect(parseSetInput({ weight: '100', reps: '5', rpe: '8,5' })).toEqual({ ok: true, value: { weightKg: 100, reps: 5, rpe: 8.5 } })
    expect(parseSetInput({ weight: '100', reps: '5', rpe: ' ' })).toEqual({ ok: true, value: { weightKg: 100, reps: 5 } })
  })

  it('peso 0 es válido (barra vacía, etc.)', () => {
    expect(parseSetInput({ weight: '0', reps: '10' }).ok).toBe(true)
  })

  it('peso corporal: vacío = 0 y negativo = asistencia', () => {
    expect(parseSetInput({ weight: '', reps: '8' }, { bodyweight: true })).toEqual({ ok: true, value: { weightKg: 0, reps: 8 } })
    expect(parseSetInput({ weight: '-20', reps: '8' }, { bodyweight: true })).toEqual({ ok: true, value: { weightKg: -20, reps: 8 } })
  })

  it.each([
    [{ weight: '', reps: '8' }, 'peso'],
    [{ weight: 'abc', reps: '8' }, 'peso'],
    [{ weight: '-5', reps: '8' }, 'negativo'],
    [{ weight: '1500', reps: '8' }, 'alto'],
    [{ weight: '80', reps: '' }, 'repeticiones'],
    [{ weight: '80', reps: '0' }, 'repeticiones'],
    [{ weight: '80', reps: '7,5' }, 'repeticiones'],
    [{ weight: '80', reps: '101' }, 'Demasiadas'],
    [{ weight: '80', reps: '8', rpe: '11' }, 'RPE'],
    [{ weight: '80', reps: '8', rpe: '7,3' }, 'RPE'],
    [{ weight: '80', reps: '8', rpe: '0' }, 'RPE'],
  ])('rechaza %o', (input, msg) => {
    const r = parseSetInput(input)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain(msg)
  })
})

describe('exerciseMuscleNames', () => {
  const muscles = [
    { id: 'chest', name: 'Pecho', group: 'chest', order: 1 },
    { id: 'front_delts', name: 'Hombro anterior', group: 'shoulders', order: 5 },
    { id: 'triceps', name: 'Tríceps', group: 'arms', order: 9 },
  ] as const

  it('separa principales y secundarios en el orden del catálogo de músculos', () => {
    const map = exerciseMuscleNames(
      [
        { exerciseId: 'dips', muscleId: 'triceps', factor: 1 },
        { exerciseId: 'dips', muscleId: 'front_delts', factor: 0.5 },
        { exerciseId: 'dips', muscleId: 'chest', factor: 1 },
        { exerciseId: 'pushdown', muscleId: 'triceps', factor: 1 },
      ],
      muscles,
    )
    expect(map.get('dips')).toEqual({ primary: ['Pecho', 'Tríceps'], secondary: ['Hombro anterior'] })
    expect(map.get('pushdown')).toEqual({ primary: ['Tríceps'], secondary: [] })
    expect(map.get('nope')).toBeUndefined()
  })

  it('músculo desconocido: usa su id', () => {
    const map = exerciseMuscleNames([{ exerciseId: 'x', muscleId: 'neck', factor: 0.5 }], muscles)
    expect(map.get('x')).toEqual({ primary: [], secondary: ['neck'] })
  })
})

describe('searchExercises', () => {
  const items = buildExerciseIndex(
    [
      { id: 'bench', name: 'Press de banca', equipment: 'barbell', isCustom: false },
      { id: 'incline', name: 'Press inclinado con barra', equipment: 'barbell', isCustom: false },
      { id: 'ohp', name: 'Press militar', equipment: 'barbell', isCustom: false },
      { id: 'curl', name: 'Curl con barra', equipment: 'barbell', isCustom: false },
      { id: 'ext', name: 'Extensión de cuádriceps', equipment: 'machine', isCustom: false },
    ],
    [
      { exerciseId: 'bench', muscleId: 'chest', factor: 1 },
      { exerciseId: 'bench', muscleId: 'triceps', factor: 0.5 },
      { exerciseId: 'incline', muscleId: 'chest', factor: 1 },
      { exerciseId: 'ohp', muscleId: 'front_delts', factor: 1 },
      { exerciseId: 'curl', muscleId: 'biceps', factor: 1 },
      { exerciseId: 'ext', muscleId: 'quads', factor: 1 },
    ],
    [
      { id: 'chest', name: 'Pecho', group: 'chest', order: 1 },
      { id: 'triceps', name: 'Tríceps', group: 'arms', order: 2 },
      { id: 'front_delts', name: 'Hombro anterior', group: 'shoulders', order: 3 },
      { id: 'biceps', name: 'Bíceps', group: 'arms', order: 4 },
      { id: 'quads', name: 'Cuádriceps', group: 'legs', order: 5 },
    ],
  )
  const ids = (q: string) => searchExercises(items, q).map((i) => i.id)

  it('indexa principales y secundarios por separado', () => {
    expect(items[0]!.primaryMuscles).toEqual(['Pecho'])
    expect(items[0]!.secondaryMuscles).toEqual(['Tríceps'])
    expect(items[2]!.secondaryMuscles).toEqual([])
  })

  it('los secundarios no cuentan en la búsqueda', () => {
    expect(ids('triceps')).toEqual([])
  })

  it('sin búsqueda: todos en orden alfabético', () => {
    expect(ids('')).toEqual(['curl', 'ext', 'bench', 'incline', 'ohp'])
  })

  it('ignora tildes y mayúsculas', () => {
    expect(ids('CUADRICEPS')).toEqual(['ext'])
    expect(ids('extension')).toEqual(['ext'])
  })

  it('todas las palabras deben aparecer, en cualquier orden', () => {
    expect(ids('banca press')).toEqual(['bench'])
    expect(ids('barra')).toEqual(['curl', 'incline'])
  })

  it('busca también por músculo', () => {
    expect(ids('pecho')).toEqual(['bench', 'incline'])
    expect(ids('press hombro')).toEqual(['ohp'])
  })

  it('prioriza lo que empieza por la búsqueda', () => {
    const list = buildExerciseIndex(
      [
        { id: 'a', name: 'Remo con barra', equipment: 'barbell', isCustom: false },
        { id: 'b', name: 'Barra fija', equipment: 'barbell', isCustom: false },
      ],
      [],
      [],
    )
    expect(searchExercises(list, 'barra').map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('sin resultados', () => {
    expect(ids('zzz')).toEqual([])
  })

  it('normalizeText', () => {
    expect(normalizeText('  Élite Bíceps ')).toBe('elite biceps')
  })
})

describe('workoutStats', () => {
  it('cuenta series de trabajo, volumen y ejercicios', () => {
    const sets = [
      { exerciseId: 'a', ...w(40, 10, true) },
      { exerciseId: 'a', ...w(100, 5) },
      { exerciseId: 'a', ...w(100, 5) },
      { exerciseId: 'b', ...w(-20, 8) }, // asistencia: no suma volumen
      { exerciseId: 'c', ...w(20, 0) }, // sin reps: no cuenta
    ]
    expect(workoutStats(sets, 0, 3_600_000)).toEqual({ durationMs: 3_600_000, workingSets: 3, volumeKg: 1000, exerciseCount: 2 })
  })

  it('duración nunca negativa', () => {
    expect(workoutStats([], 10, 5).durationMs).toBe(0)
  })
})

describe('findPersonalRecords', () => {
  let n = 0
  const s = (exerciseId: string, weightKg: number, reps: number, isWarmup = false) => ({ id: `s${++n}`, exerciseId, weightKg, reps, isWarmup })

  it('detecta récords de e1RM frente al histórico', () => {
    const prev = [s('bench', 100, 5), s('bench', 90, 10), s('squat', 140, 3)]
    // histórico banca: 90 × 10 = 120; hoy 100 × 7 = 123,3 → récord. Sentadilla: 140 × 3 = 154 > 130 × 5 = 151,7
    const today = [s('bench', 100, 7), s('bench', 105, 3), s('squat', 130, 5)]
    const prs = findPersonalRecords(prev, today)
    expect(prs).toHaveLength(1)
    expect(prs[0]).toMatchObject({ exerciseId: 'bench', weightKg: 100, reps: 7, previousBest: 120 })
    expect(prs[0]!.e1rm).toBeCloseTo(100 * (1 + 7 / 30))
  })

  it('igualar el récord no es récord', () => {
    expect(findPersonalRecords([s('bench', 100, 5)], [s('bench', 100, 5)])).toEqual([])
  })

  it('la primera vez no cuenta y los calentamientos se ignoran', () => {
    expect(findPersonalRecords([], [s('bench', 100, 5)])).toEqual([])
    expect(findPersonalRecords([s('bench', 60, 5)], [s('bench', 200, 5, true)])).toEqual([])
  })

  it('ejercicios de peso corporal usan peso + lastre', () => {
    const prs = findPersonalRecords([s('pull_up', 0, 5)], [s('pull_up', 10, 5)], { bodyweightKg: 80 })
    expect(prs[0]).toMatchObject({ exerciseId: 'pull_up', e1rm: 90 * (1 + 5 / 30), previousBest: 80 * (1 + 5 / 30) })
    expect(findPersonalRecords([s('pull_up', 0, 5)], [s('pull_up', 10, 5)])).toEqual([])
  })
})

describe('formatRoutineTarget', () => {
  it.each([
    [{}, ''],
    [{ targetSets: 3 }, '3 series'],
    [{ targetSets: 3, targetRepsMin: 10, targetRepsMax: 10 }, '3 × 10'],
    [{ targetSets: 4, targetRepsMin: 6, targetRepsMax: 8 }, '4 × 6-8'],
  ])('%o → "%s"', (t, s) => {
    expect(formatRoutineTarget(t)).toBe(s)
  })
})

describe('setLabels', () => {
  it('numera solo las series de trabajo', () => {
    expect(setLabels([w(20, 10, true), w(60, 5), w(40, 5, true), w(60, 5)])).toEqual(['C', '1', 'C', '2'])
    expect(setLabels([])).toEqual([])
  })
})

describe('suggestPlannedSet', () => {
  const planned = { weightKg: 72.5, repsMin: 8, repsMax: 10 }
  it('primera serie del día: peso calculado por la app y reps centrales', () => {
    expect(suggestPlannedSet(planned, [w(70, 8)], [])).toEqual({ weightKg: 72.5, reps: 9 })
    expect(suggestPlannedSet(planned, [], [w(40, 10, true)])).toEqual({ weightKg: 72.5, reps: 9 })
  })
  it('después manda lo hecho hoy; sin peso calculado, la última sesión', () => {
    expect(suggestPlannedSet(planned, [], [w(75, 8)])).toEqual({ weightKg: 75, reps: 8 })
    expect(suggestPlannedSet({ ...planned, weightKg: null }, [w(70, 8)], [])).toEqual({ weightKg: 70, reps: 8 })
    expect(suggestPlannedSet(undefined, [], [])).toBeNull()
  })
})

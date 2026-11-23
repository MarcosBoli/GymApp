import { describe, expect, it } from 'vitest'
import {
  bucketWeightTrend,
  buildRankOverview,
  chartExerciseOptions,
  e1rmHistory,
  exercisesForMuscle,
  lpToNext,
  emblemState,
  muscleContributions,
  rankHistory,
  tierTicks,
  volumeBin,
  weeklyVolumeByMuscle,
  weightWindow,
} from './progress'
import { DAY_MS, ladderPoints, rankFromScore, type RankedSet, type StrengthStandards } from './ranking'
import type { ExerciseMuscle } from './types'
import { RANK_CONFIG } from '../data/ranking'

const NOW = new Date(2026, 10, 25, 18).getTime() // miércoles
const daysAgo = (d: number) => NOW - d * DAY_MS
let n = 0
const set = (exerciseId: string, weightKg: number, reps: number, performedAt = NOW, isWarmup = false): RankedSet => ({
  id: `s${++n}`, exerciseId, weightKg, reps, performedAt, isWarmup,
})

const STD: StrengthStandards = {
  levels: ['p', 'n', 'i', 'a', 'e'],
  levelScores: [10, 30, 50, 75, 100],
  exercises: {
    bench: { male: [0.5, 0.75, 1, 1.5, 2], female: [0.25, 0.5, 0.75, 1, 1.25] },
    fly: { male: [0.2, 0.4, 0.6, 0.8, 1], female: [0.1, 0.2, 0.3, 0.4, 0.5] },
    pullup: { addBodyweight: true, male: [0.8, 1, 1.25, 1.5, 1.8], female: [0.9, 1, 1.1, 1.25, 1.45] },
  },
}
const EM: ExerciseMuscle[] = [
  { exerciseId: 'bench', muscleId: 'chest', factor: 1 },
  { exerciseId: 'bench', muscleId: 'triceps', factor: 0.5 },
  { exerciseId: 'fly', muscleId: 'chest', factor: 1 },
  { exerciseId: 'pullup', muscleId: 'lats', factor: 1 },
]
const MUSCLES = [
  { id: 'chest', name: 'Pecho' },
  { id: 'triceps', name: 'Tríceps' },
  { id: 'lats', name: 'Dorsal' },
  { id: 'quads', name: 'Cuádriceps' },
]

describe('buildRankOverview', () => {
  const sets = [
    ...Array.from({ length: 6 }, () => set('bench', 80, 1, daysAgo(1))),
    ...Array.from({ length: 4 }, () => set('fly', 32, 1, daysAgo(2))),
    set('pullup', 0, 1, daysAgo(20)),
  ]
  const base = { sets, exerciseMuscles: EM, muscles: MUSCLES, bodyweightKg: 80, sex: 'male' as const, now: NOW }

  it('rangos por músculo con nombre, global, eslabón débil e inactivos', () => {
    const o = buildRankOverview({ ...base, rankStates: {} }, STD)
    expect(o.muscles.map((m) => m.name)).toEqual(['Pecho', 'Tríceps', 'Dorsal', 'Cuádriceps'])
    expect(o.muscles[0]!.displayed).toEqual(rankFromScore(o.muscles[0]!.score!))
    expect(o.muscles[3]!.displayed).toBeNull()
    expect(o.weakLink?.muscleId).toBe('lats')
    expect(o.inactive.map((m) => m.muscleId)).toEqual(['lats'])
    expect(o.global.trainedMuscles).toBe(3)
    expect(o.global.displayed).not.toBeNull()
  })

  it('respeta la promo en curso al mostrar', () => {
    const o = buildRankOverview({ ...base, rankStates: { chest: { status: 'promo', tierIndex: 1, targetTierIndex: 4, wins: 1, losses: 0 } } }, STD)
    expect(o.muscles[0]!.displayed).toMatchObject({ tierIndex: 1, lp: 100 })
    expect(o.muscles[0]!.promo?.status).toBe('promo')
  })

  it('sin peso corporal o sin sexo no hay rangos', () => {
    for (const over of [{ bodyweightKg: undefined }, { sex: undefined }]) {
      const o = buildRankOverview({ ...base, ...over, rankStates: {} }, STD)
      expect(o.global.displayed).toBeNull()
      expect(o.weakLink).toBeNull()
      expect(o.muscles.every((m) => m.displayed === null)).toBe(true)
    }
  })
})

describe('emblemState', () => {
  const r = rankFromScore(50)
  it.each([
    [{ displayed: null }, 'locked'],
    [{ displayed: null, inactive: true }, 'locked'],
    [{ displayed: r }, 'ranked'],
    [{ displayed: r, promo: { status: 'stable', tierIndex: 2 } }, 'ranked'],
    [{ displayed: r, promo: { status: 'promo', tierIndex: 2, targetTierIndex: 3, wins: 1, losses: 0 } }, 'promo'],
    [{ displayed: r, inactive: true, promo: { status: 'promo', tierIndex: 2, targetTierIndex: 3, wins: 0, losses: 0 } }, 'inactive'],
  ] as const)('%o → %s', (m, state) => {
    expect(emblemState(m)).toBe(state)
  })
})

describe('lpToNext', () => {
  it('LP que faltan', () => {
    expect(lpToNext(rankFromScore(28 + 8 / 3))).toBe(50) // Aprendiz III a mitad
    expect(lpToNext(rankFromScore(100))).toBe(0)
  })
})

describe('muscleContributions', () => {
  const ex = new Map([
    ['bench', { e1rm: 100, score: 60 }],
    ['fly', { e1rm: 30, score: 30 }],
    ['pullup', { e1rm: 90, score: null }],
  ])

  it('ordena por score × factor y calcula la parte de cada uno', () => {
    const c = muscleContributions('chest', ex, EM)
    expect(c.map((x) => x.exerciseId)).toEqual(['bench', 'fly'])
    expect(c[0]).toMatchObject({ factor: 1, score: 60, e1rm: 100 })
    expect(c[0]!.share).toBeCloseTo(60 / 90)
    expect(c.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
  })

  it('el factor secundario pesa la mitad', () => {
    const em: ExerciseMuscle[] = [
      { exerciseId: 'a', muscleId: 'm', factor: 1 },
      { exerciseId: 'b', muscleId: 'm', factor: 0.5 },
    ]
    const c = muscleContributions('m', new Map([['a', { e1rm: 1, score: 40 }], ['b', { e1rm: 1, score: 60 }]]), em)
    expect(c.map((x) => x.exerciseId)).toEqual(['a', 'b']) // 40 > 30
  })

  it('ignora ejercicios sin score o sin datos', () => {
    expect(muscleContributions('lats', ex, EM)).toEqual([])
    expect(muscleContributions('quads', ex, EM)).toEqual([])
  })
})

describe('exercisesForMuscle', () => {
  it('por número de series de trabajo', () => {
    const sets = [set('fly', 20, 10), set('fly', 20, 10), set('bench', 80, 5), set('bench', 40, 10, NOW, true), set('pullup', 0, 5)]
    expect(exercisesForMuscle('chest', sets, EM)).toEqual(['fly', 'bench'])
    expect(exercisesForMuscle('quads', sets, EM)).toEqual([])
  })
})

describe('e1rmHistory', () => {
  it('mejor e1RM por día, en orden', () => {
    const sets = [
      set('bench', 80, 5, daysAgo(7)),
      set('bench', 85, 3, daysAgo(7) + 60_000),
      set('bench', 90, 1, daysAgo(0)),
      set('bench', 200, 1, daysAgo(3), true), // calentamiento
      set('fly', 20, 10, daysAgo(3)),
    ]
    const h = e1rmHistory(sets, 'bench', { standards: STD })
    expect(h).toHaveLength(2)
    expect(h[0]!.e1rm).toBeCloseTo(85 * 1.1)
    expect(h[1]).toEqual({ date: '2026-11-25', e1rm: 90 })
  })

  it('peso corporal + lastre en dominadas', () => {
    expect(e1rmHistory([set('pullup', 10, 1)], 'pullup', { bodyweightKg: 80, standards: STD })[0]!.e1rm).toBe(90)
    expect(e1rmHistory([set('pullup', 10, 1)], 'pullup', { standards: STD })).toEqual([])
  })
})

describe('weeklyVolumeByMuscle', () => {
  it('series por semana (lunes–domingo) con factor; solo las últimas N semanas', () => {
    const sets = [
      set('bench', 80, 5, NOW), // esta semana
      set('bench', 80, 5, new Date(2026, 10, 23, 9).getTime()), // lunes de esta semana
      set('bench', 80, 5, new Date(2026, 10, 22, 9).getTime()), // domingo anterior
      set('bench', 40, 10, NOW, true), // calentamiento
      set('bench', 80, 5, daysAgo(80)), // fuera
      set('bench', 80, 5, NOW + 3 * DAY_MS), // futuro
    ]
    const v = weeklyVolumeByMuscle(sets, EM, '2026-11-25', 3)
    expect(v.weekStarts).toEqual(['2026-11-09', '2026-11-16', '2026-11-23'])
    expect(v.byMuscle.get('chest')).toEqual([0, 1, 2])
    expect(v.byMuscle.get('triceps')).toEqual([0, 0.5, 1])
    expect(v.byMuscle.has('lats')).toBe(false)
  })
})

describe('volumeBin', () => {
  it.each([
    [0, 0],
    [0.5, 1],
    [5, 1],
    [5.5, 2],
    [10, 2],
    [12, 3],
    [20, 4],
    [21, 5],
    [60, 5],
  ])('%d series → tramo %d', (sets, bin) => {
    expect(volumeBin(sets)).toBe(bin)
  })
})

describe('rankHistory / tierTicks', () => {
  const diff = (id: string, score: number) => ({ id, before: null, after: rankFromScore(score), lpDelta: 0, change: 'new' as const })
  const summary = (diffs: ReturnType<typeof diff>[]) => ({ durationMs: 0, workingSets: 1, volumeKg: 0, exerciseCount: 1, ranked: true, diffs, promotions: [], records: [] })

  it('rango tras cada entreno, ordenado, solo de entrenos con ese id', () => {
    const ws = [
      { endedAt: 3000, summary: summary([diff('global', 50)]) },
      { endedAt: 1000, summary: summary([diff('global', 30), diff('chest', 40)]) },
      { endedAt: 2000, summary: summary([diff('chest', 45)]) },
      { endedAt: undefined, summary: undefined },
    ]
    const g = rankHistory(ws, 'global')
    expect(g.map((p) => p.at)).toEqual([1000, 3000])
    expect(g[1]!.points).toBe(ladderPoints(rankFromScore(50)))
    expect(rankHistory(ws, 'chest').map((p) => p.at)).toEqual([1000, 2000])
  })

  it('marcas de tiers crecientes que empiezan en 0', () => {
    const t = tierTicks()
    expect(t).toHaveLength(RANK_CONFIG.tiers.length)
    expect(t[0]).toMatchObject({ points: 0, name: 'Novato' })
    for (let i = 1; i < t.length; i++) expect(t[i]!.points).toBeGreaterThan(t[i - 1]!.points)
  })
})

describe('weightWindow', () => {
  const pts = ['2026-10-01', '2026-11-20', '2026-11-25', '2026-11-26'].map((date) => ({ date }))
  it('filtra por ventana y excluye el futuro', () => {
    expect(weightWindow(pts, '2026-11-25', 30).map((p) => p.date)).toEqual(['2026-11-20', '2026-11-25'])
    expect(weightWindow(pts, '2026-11-25', Infinity)).toHaveLength(3)
  })
})

describe('chartExerciseOptions', () => {
  it('contribuciones primero, sin repetir, con máximo', () => {
    const c = [{ exerciseId: 'a' }, { exerciseId: 'b' }] as never
    expect(chartExerciseOptions(c, ['b', 'c', 'd'], 3)).toEqual(['a', 'b', 'c'])
    expect(chartExerciseOptions([], [])).toEqual([])
  })
})

describe('bucketWeightTrend', () => {
  it('con pocos puntos no cambia nada', () => {
    const pts = [{ date: '2026-11-23', weightKg: 80, trendKg: 80 }]
    expect(bucketWeightTrend(pts)).toEqual(pts)
  })

  it('con muchos puntos agrega por semanas (media del peso, tendencia al final)', () => {
    const pts = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-11-${String(16 + i).padStart(2, '0')}`.replace('2026-11-31', '2026-12-01'),
      ...(i % 2 === 0 ? { weightKg: 80 + i } : {}),
      trendKg: 80 + i / 10,
    })).filter((p) => p.date <= '2026-11-29')
    const b = bucketWeightTrend(pts, 5)
    expect(b.map((x) => x.date)).toEqual(['2026-11-16', '2026-11-23'])
    expect(b[0]!.weightKg).toBeCloseTo((80 + 82 + 84 + 86) / 4)
    expect(b[0]!.trendKg).toBeCloseTo(80.6)
    expect(b[1]!.trendKg).toBeCloseTo(81.3)
  })
})

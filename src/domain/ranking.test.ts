import { describe, expect, it } from 'vitest'
import {
  DAY_MS,
  advancePromotion,
  bestE1RMByExercise,
  combineMuscleScore,
  computeRankings,
  consistencyScore,
  diffRanks,
  displayedRank,
  effectiveSetsByMuscle,
  epley,
  exerciseScore,
  formatRank,
  globalRank,
  isInactive,
  ladderPoints,
  lastTrainedByMuscle,
  muscleStrengthScore,
  rankFromScore,
  rankSnapshot,
  replayPromotion,
  scoreFromRatio,
  setE1RM,
  tierIndexForScore,
  type Levels5,
  type PromotionState,
  type RankConfig,
  type RankedSet,
  type StrengthStandards,
} from './ranking'
import type { ExerciseMuscle } from './types'
import { RANK_CONFIG } from '../data/ranking'

// ─── Fixtures ──────────────────────────────────────────────────────────────

const NOW = Date.UTC(2026, 10, 22, 12)
const daysAgo = (d: number) => NOW - d * DAY_MS

let seq = 0
function set(exerciseId: string, weightKg: number, reps: number, performedAt = NOW, extra: Partial<RankedSet> = {}): RankedSet {
  return { id: `s${++seq}`, exerciseId, weightKg, reps, performedAt, isWarmup: false, ...extra }
}

const STD: StrengthStandards = {
  levels: ['principiante', 'novato', 'intermedio', 'avanzado', 'elite'],
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
  { exerciseId: 'pullup', muscleId: 'biceps', factor: 0.5 },
  { exerciseId: 'pushup', muscleId: 'chest', factor: 1 }, // sin estándar
]

// Config de test: 4 tiers fáciles de razonar (anchos de 20/40/20/20)
const CFG: RankConfig = {
  ...RANK_CONFIG,
  tiers: [
    { id: 'a', name: 'A', minScore: 0, divisions: true, color: '' },
    { id: 'b', name: 'B', minScore: 20, divisions: true, color: '' },
    { id: 'c', name: 'C', minScore: 60, divisions: false, color: '' },
    { id: 'd', name: 'D', minScore: 80, divisions: false, color: '' },
  ],
}

// ─── 1. e1RM ───────────────────────────────────────────────────────────────

describe('epley', () => {
  it.each([
    [100, 1, 100],
    [100, 5, 100 * (1 + 5 / 30)],
    [100, 10, 100 * (1 + 10 / 30)],
    [60, 12, 60 * 1.4],
  ])('%d kg × %d → %f', (w, r, e) => {
    expect(epley(w, r)).toBeCloseTo(e, 10)
  })

  it('limita las reps a maxReps', () => {
    expect(epley(100, 30, 12)).toBeCloseTo(140)
    expect(epley(100, 13, 12)).toBe(epley(100, 12, 12))
    expect(epley(100, 20, 20)).toBeCloseTo(100 * (1 + 20 / 30))
  })

  it('trunca reps fraccionarias', () => {
    expect(epley(100, 5.9)).toBe(epley(100, 5))
  })

  it.each([
    [0, 5],
    [-10, 5],
    [100, 0],
    [100, 0.5],
    [100, -3],
    [Number.NaN, 5],
    [100, Number.NaN],
  ])('null para carga %d y reps %d', (w, r) => {
    expect(epley(w, r)).toBeNull()
  })
})

describe('setE1RM', () => {
  it('ignora calentamientos', () => {
    expect(setE1RM({ weightKg: 100, reps: 5, isWarmup: true })).toBeNull()
  })

  it('usa solo el peso en ejercicios normales', () => {
    expect(setE1RM({ weightKg: 100, reps: 5, isWarmup: false }, { bodyweightKg: 80 })).toBeCloseTo(100 * (1 + 5 / 30))
  })

  it('dominadas/fondos: peso corporal + lastre', () => {
    expect(setE1RM({ weightKg: 0, reps: 1, isWarmup: false }, { addBodyweight: true, bodyweightKg: 80 })).toBe(80)
    expect(setE1RM({ weightKg: 20, reps: 5, isWarmup: false }, { addBodyweight: true, bodyweightKg: 80 })).toBeCloseTo(100 * (1 + 5 / 30))
  })

  it('lastre negativo = asistencia', () => {
    expect(setE1RM({ weightKg: -30, reps: 1, isWarmup: false }, { addBodyweight: true, bodyweightKg: 80 })).toBe(50)
    expect(setE1RM({ weightKg: -90, reps: 1, isWarmup: false }, { addBodyweight: true, bodyweightKg: 80 })).toBeNull()
  })

  it('sin peso corporal no se puede calcular un ejercicio de peso corporal', () => {
    expect(setE1RM({ weightKg: 10, reps: 5, isWarmup: false }, { addBodyweight: true })).toBeNull()
    expect(setE1RM({ weightKg: 10, reps: 5, isWarmup: false }, { addBodyweight: true, bodyweightKg: 0 })).toBeNull()
  })

  it('respeta maxReps', () => {
    expect(setE1RM({ weightKg: 100, reps: 20, isWarmup: false }, { maxReps: 10 })).toBeCloseTo(100 * (1 + 10 / 30))
  })
})

// ─── 2. Mejor e1RM en ventana ──────────────────────────────────────────────

describe('bestE1RMByExercise', () => {
  const opts = { now: NOW, bodyweightKg: 80, standards: STD }

  it('elige la mejor serie por ejercicio', () => {
    const sets = [set('bench', 100, 5), set('bench', 110, 1), set('bench', 90, 10), set('fly', 20, 12)]
    const best = bestE1RMByExercise(sets, opts)
    expect(best.get('bench')?.e1rm).toBeCloseTo(120) // 90 × (1 + 10/30)
    expect(best.get('bench')?.setId).toBe(sets[2]!.id)
    expect(best.get('fly')?.e1rm).toBeCloseTo(28)
  })

  it('en empate se queda con la primera serie', () => {
    const a = set('bench', 100, 1)
    const b = set('bench', 100, 1)
    expect(bestE1RMByExercise([a, b], opts).get('bench')?.setId).toBe(a.id)
  })

  it('ventana de 42 días incluida en los bordes; excluye el futuro', () => {
    const sets = [
      set('bench', 200, 1, daysAgo(43)),
      set('bench', 150, 1, daysAgo(42) - 1),
      set('bench', 100, 1, daysAgo(42)),
      set('bench', 300, 1, NOW + 1),
    ]
    expect(bestE1RMByExercise(sets, opts).get('bench')?.e1rm).toBe(100)
  })

  it('ventana configurable', () => {
    const sets = [set('bench', 200, 1, daysAgo(10)), set('bench', 100, 1, daysAgo(1))]
    expect(bestE1RMByExercise(sets, { ...opts, windowDays: 7 }).get('bench')?.e1rm).toBe(100)
  })

  it('ignora calentamientos y series sin reps', () => {
    const sets = [set('bench', 200, 5, NOW, { isWarmup: true }), set('bench', 150, 0), set('bench', 60, 5)]
    expect(bestE1RMByExercise(sets, opts).get('bench')?.e1rm).toBeCloseTo(70)
  })

  it('suma el peso corporal en ejercicios con addBodyweight', () => {
    const best = bestE1RMByExercise([set('pullup', 10, 1)], opts)
    expect(best.get('pullup')?.e1rm).toBe(90)
  })

  it('omite ejercicios sin series válidas', () => {
    expect(bestE1RMByExercise([set('bench', 0, 5)], opts).size).toBe(0)
    expect(bestE1RMByExercise([], opts).size).toBe(0)
  })
})

// ─── 3. Score por ejercicio ────────────────────────────────────────────────

describe('scoreFromRatio', () => {
  const t: Levels5 = [0.5, 0.75, 1, 1.5, 2]
  const s: Levels5 = [10, 30, 50, 75, 100]

  it.each([
    [0, 0],
    [0.25, 5],
    [0.5, 10],
    [0.625, 20],
    [0.75, 30],
    [1, 50],
    [1.25, 62.5],
    [1.5, 75],
    [1.75, 87.5],
    [2, 100],
    [3, 100],
  ])('ratio %f → %f', (ratio, expected) => {
    expect(scoreFromRatio(ratio, t, s)).toBeCloseTo(expected, 10)
  })

  it('ratio negativo o NaN → 0', () => {
    expect(scoreFromRatio(-1, t, s)).toBe(0)
    expect(scoreFromRatio(Number.NaN, t, s)).toBe(0)
  })

  it('es monótona creciente', () => {
    let prev = -1
    for (let r = 0; r <= 2.5; r += 0.01) {
      const v = scoreFromRatio(r, t, s)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})

describe('exerciseScore', () => {
  it('usa el ratio e1RM / peso corporal y el sexo', () => {
    expect(exerciseScore('bench', 80, 80, 'male', STD)).toBeCloseTo(50) // ratio 1 → intermedio
    expect(exerciseScore('bench', 80, 80, 'female', STD)).toBeCloseTo(75) // ratio 1 → avanzado
  })

  it('limita a 100 por encima de élite', () => {
    expect(exerciseScore('bench', 400, 80, 'male', STD)).toBe(100)
  })

  it('null sin estándar o sin peso corporal válido', () => {
    expect(exerciseScore('pushup', 80, 80, 'male', STD)).toBeNull()
    expect(exerciseScore('bench', 80, undefined, 'male', STD)).toBeNull()
    expect(exerciseScore('bench', 80, 0, 'male', STD)).toBeNull()
  })

  it('funciona con los estándares reales', () => {
    // 80 kg de peso, press banca 1RM 88 kg (ratio 1.1 = intermedio) → 50
    expect(exerciseScore('bench_press', 88, 80, 'male')).toBeCloseTo(50)
  })
})

// ─── 4. Score por músculo ──────────────────────────────────────────────────

describe('muscleStrengthScore', () => {
  it('media ponderada por factor', () => {
    const scores = new Map([
      ['bench', 60],
      ['fly', 30],
    ])
    expect(muscleStrengthScore('chest', scores, EM)).toBeCloseTo(45)
    // tríceps solo tiene bench (0.5) → media = 60
    expect(muscleStrengthScore('triceps', scores, EM)).toBeCloseTo(60)
  })

  it('pondera principal (1) frente a secundario (0.5)', () => {
    const em: ExerciseMuscle[] = [
      { exerciseId: 'x', muscleId: 'm', factor: 1 },
      { exerciseId: 'y', muscleId: 'm', factor: 0.5 },
    ]
    // (90·1 + 30·0.5) / 1.5 = 70
    expect(muscleStrengthScore('m', new Map([['x', 90], ['y', 30]]), em)).toBeCloseTo(70)
  })

  it('ignora ejercicios sin score; null si no hay ninguno', () => {
    expect(muscleStrengthScore('chest', new Map([['bench', 40]]), EM)).toBe(40)
    expect(muscleStrengthScore('chest', new Map(), EM)).toBeNull()
    expect(muscleStrengthScore('quads', new Map([['bench', 40]]), EM)).toBeNull()
  })
})

describe('effectiveSetsByMuscle', () => {
  it('cuenta series efectivas de 7 días con factor', () => {
    const sets = [
      set('bench', 100, 5, daysAgo(1)),
      set('bench', 100, 5, daysAgo(7)), // borde incluido
      set('bench', 100, 5, daysAgo(8)), // fuera
      set('bench', 40, 10, daysAgo(1), { isWarmup: true }), // calentamiento
      set('bench', 100, 0, daysAgo(1)), // 0 reps
      set('pushup', 0, 20, daysAgo(2)), // sin estándar también cuenta
      set('pullup', 0, 8, NOW + DAY_MS), // futuro
    ]
    const eff = effectiveSetsByMuscle(sets, EM, { now: NOW })
    expect(eff.get('chest')).toBe(3)
    expect(eff.get('triceps')).toBe(1)
    expect(eff.has('lats')).toBe(false)
  })

  it('ignora ejercicios sin mapeo a músculos', () => {
    expect(effectiveSetsByMuscle([set('unknown', 50, 5)], EM, { now: NOW }).size).toBe(0)
  })
})

describe('consistencyScore', () => {
  it.each([
    [0, 0],
    [-1, 0],
    [2.5, 25],
    [5, 50],
    [9.5, 95],
    [10, 100],
    [15, 100],
    [20, 100],
    [30, 75],
    [40, 50],
    [60, 50],
  ])('%f series → %f', (sets, expected) => {
    expect(consistencyScore(sets)).toBeCloseTo(expected, 10)
  })
})

describe('combineMuscleScore', () => {
  it('80 % fuerza + 20 % constancia', () => {
    expect(combineMuscleScore(50, 100)).toBeCloseTo(60)
    expect(combineMuscleScore(100, 0)).toBeCloseTo(80)
    expect(combineMuscleScore(0, 100)).toBeCloseTo(20)
    expect(combineMuscleScore(100, 100)).toBeCloseTo(100)
  })

  it('pesos configurables', () => {
    expect(combineMuscleScore(50, 100, { strength: 0.5, consistency: 0.5 })).toBeCloseTo(75)
  })
})

// ─── 5. Score → tier / división / LP ───────────────────────────────────────

describe('rankFromScore (config real)', () => {
  it.each([
    [0, 'Hierro', 'IV', 0],
    [1.5, 'Hierro', 'IV', 50],
    [2.99, 'Hierro', 'IV', 99],
    [3, 'Hierro', 'III', 0],
    [11.99, 'Hierro', 'I', 99],
    [12, 'Bronce', 'IV', 0],
    [24, 'Plata', 'IV', 0],
    [36, 'Oro', 'IV', 0],
    [46.5, 'Oro', 'I', 50],
    [48, 'Platino', 'IV', 0],
    [60, 'Esmeralda', 'IV', 0],
    [72, 'Diamante', 'IV', 0],
    [83.9, 'Diamante', 'I', 96],
    [84, 'Maestro', null, 0],
    [89, 'Maestro', null, 50],
    [93.99, 'Maestro', null, 99],
    [94, 'Leyenda', null, 0],
    [97, 'Leyenda', null, 50],
    [100, 'Leyenda', null, 100],
  ])('score %f → %s %s %d LP', (score, tier, division, lp) => {
    const r = rankFromScore(score)
    expect(r.tierName).toBe(tier)
    expect(r.division).toBe(division)
    expect(r.lp).toBe(lp)
  })

  it('limita scores fuera de rango', () => {
    expect(rankFromScore(-5)).toMatchObject({ tierName: 'Hierro', division: 'IV', lp: 0, score: 0 })
    expect(rankFromScore(150)).toMatchObject({ tierName: 'Leyenda', lp: 100, score: 100 })
  })

  it('LP siempre en 0-99 salvo en el tope', () => {
    for (let s = 0; s < 100; s += 0.37) {
      const { lp } = rankFromScore(s)
      expect(lp).toBeGreaterThanOrEqual(0)
      expect(lp).toBeLessThanOrEqual(99)
      expect(Number.isInteger(lp)).toBe(true)
    }
  })

  it('no sufre errores de coma flotante en los bordes de división', () => {
    expect(rankFromScore(12 + 3 * 0.1 * 10)).toMatchObject({ tierName: 'Bronce', division: 'III', lp: 0 })
    expect(rankFromScore(0.1 + 0.2)).toMatchObject({ division: 'IV', lp: 10 })
  })
})

describe('tierIndexForScore', () => {
  it('encuentra el tier', () => {
    expect(tierIndexForScore(0)).toBe(0)
    expect(tierIndexForScore(11.999)).toBe(0)
    expect(tierIndexForScore(12)).toBe(1)
    expect(tierIndexForScore(100)).toBe(8)
    expect(tierIndexForScore(65, CFG)).toBe(2)
  })
})

describe('ladderPoints', () => {
  it('es estrictamente creciente con el score (config real)', () => {
    let prev = -1
    for (let s = 0; s <= 100; s += 0.5) {
      const p = ladderPoints(rankFromScore(s))
      expect(p).toBeGreaterThanOrEqual(prev)
      prev = p
    }
  })

  it('cada división vale 100 LP y los tiers sin divisiones 100', () => {
    expect(ladderPoints(rankFromScore(0))).toBe(0)
    expect(ladderPoints(rankFromScore(3))).toBe(100) // Hierro III 0
    expect(ladderPoints(rankFromScore(12))).toBe(400) // Bronce IV 0
    expect(ladderPoints(rankFromScore(84))).toBe(7 * 400) // Maestro 0
    expect(ladderPoints(rankFromScore(94))).toBe(7 * 400 + 100) // Leyenda 0
    expect(ladderPoints(rankFromScore(100))).toBe(7 * 400 + 200)
  })
})

describe('formatRank', () => {
  it('incluye división si la hay', () => {
    expect(formatRank(rankFromScore(40))).toBe('Oro III')
    expect(formatRank(rankFromScore(90))).toBe('Maestro')
  })
})

// ─── 6. Global y eslabón débil ─────────────────────────────────────────────

describe('globalRank', () => {
  it('media de los músculos entrenados e identifica el más bajo', () => {
    const g = globalRank([
      ['chest', 60],
      ['lats', 30],
      ['quads', null],
      ['biceps', 45],
    ])
    expect(g.score).toBeCloseTo(45)
    expect(g.trainedMuscles).toBe(3)
    expect(g.weakLink).toEqual({ muscleId: 'lats', score: 30 })
    expect(g.rank?.tierName).toBe('Oro')
  })

  it('en empate el eslabón débil es el primero', () => {
    expect(globalRank([['a', 20], ['b', 20]]).weakLink?.muscleId).toBe('a')
  })

  it('sin músculos entrenados → sin rango', () => {
    expect(globalRank([['a', null]])).toEqual({ score: null, rank: null, trainedMuscles: 0, weakLink: null })
    expect(globalRank([])).toEqual({ score: null, rank: null, trainedMuscles: 0, weakLink: null })
  })
})

// ─── 7. Promociones ────────────────────────────────────────────────────────

describe('advancePromotion (CFG: A<20, B<60, C<80, D)', () => {
  const stable = (tierIndex: number): PromotionState => ({ status: 'stable', tierIndex })

  it('primera sesión: colocación directa', () => {
    expect(advancePromotion(undefined, 70, CFG)).toEqual(stable(2))
  })

  it('sin cruzar umbral se mantiene estable (y sigue el tier del score)', () => {
    expect(advancePromotion(stable(1), 40, CFG)).toEqual(stable(1))
  })

  it('cruzar el umbral abre una promo; la sesión que cruza no cuenta', () => {
    expect(advancePromotion(stable(1), 65, CFG)).toEqual({ status: 'promo', tierIndex: 1, targetTierIndex: 2, wins: 0, losses: 0 })
  })

  it('saltar varios tiers apunta al tier alcanzado', () => {
    expect(advancePromotion(stable(0), 85, CFG)).toMatchObject({ status: 'promo', tierIndex: 0, targetTierIndex: 3 })
  })

  it('2 victorias seguidas → ascenso', () => {
    expect(replayPromotion([40, 65, 66, 70], CFG)).toEqual(stable(2))
  })

  it('victoria, derrota, victoria → ascenso en la 3.ª', () => {
    const s = replayPromotion([40, 65, 66, 50], CFG)
    expect(s).toEqual({ status: 'promo', tierIndex: 1, targetTierIndex: 2, wins: 1, losses: 1 })
    expect(advancePromotion(s, 61, CFG)).toEqual(stable(2))
  })

  it('derrota, victoria, victoria → ascenso', () => {
    expect(replayPromotion([40, 65, 50, 66, 70], CFG)).toEqual(stable(2))
  })

  it('2 derrotas → promo fallida, se queda en el tier confirmado', () => {
    expect(replayPromotion([40, 65, 50, 55], CFG)).toEqual(stable(1))
  })

  it('victoria, derrota, derrota → fallida', () => {
    expect(replayPromotion([40, 65, 70, 50, 55], CFG)).toEqual(stable(1))
  })

  it('tras fallar puede abrir otra promo', () => {
    const failed = replayPromotion([40, 65, 50, 55], CFG)
    expect(advancePromotion(failed, 62, CFG)).toMatchObject({ status: 'promo', targetTierIndex: 2, wins: 0, losses: 0 })
  })

  it('una victoria en promo exige llegar al tier objetivo, no solo superar el confirmado', () => {
    // confirmado A (0), objetivo C (2); sacar B no es victoria
    const s = replayPromotion([10, 65, 40, 45], CFG)
    expect(s).toEqual(stable(0)) // fallida → min(confirmado 0, actual 1) = 0
  })

  it('si en la promo fallida el score cae por debajo del confirmado, baja', () => {
    expect(replayPromotion([40, 65, 10, 5], CFG)).toEqual(stable(0))
  })

  it('bajar de tier fuera de promo es inmediato', () => {
    expect(advancePromotion(stable(2), 30, CFG)).toEqual(stable(1))
    expect(advancePromotion(stable(2), 5, CFG)).toEqual(stable(0))
  })

  it('respeta sessions/winsNeeded configurables (mejor de 5, 3 victorias)', () => {
    const cfg: RankConfig = { ...CFG, promotion: { sessions: 5, winsNeeded: 3 } }
    expect(replayPromotion([40, 65, 50, 50, 65, 65], cfg)).toMatchObject({ status: 'promo', wins: 2, losses: 2 })
    expect(replayPromotion([40, 65, 50, 50, 65, 65, 65], cfg)).toEqual(stable(2))
    expect(replayPromotion([40, 65, 50, 50, 50], cfg)).toEqual(stable(1))
  })

  it('replay sin sesiones → undefined', () => {
    expect(replayPromotion([], CFG)).toBeUndefined()
  })
})

describe('displayedRank', () => {
  it('estable y score dentro del tier → rango real', () => {
    expect(displayedRank({ status: 'stable', tierIndex: 1 }, 40, CFG)).toEqual(rankFromScore(40, CFG))
  })

  it('en promo se muestra el tier confirmado, división I y 100 LP', () => {
    const r = displayedRank({ status: 'promo', tierIndex: 1, targetTierIndex: 2, wins: 1, losses: 0 }, 70, CFG)
    expect(r).toMatchObject({ tierIndex: 1, tierName: 'B', division: 'I', lp: 100, score: 70 })
  })

  it('estable con score por encima (tras promo fallida) → tope con 99 LP', () => {
    expect(displayedRank({ status: 'stable', tierIndex: 1 }, 70, CFG)).toMatchObject({ tierIndex: 1, division: 'I', lp: 99 })
  })

  it('tier sin divisiones en promo → división null', () => {
    expect(displayedRank({ status: 'promo', tierIndex: 2, targetTierIndex: 3, wins: 0, losses: 0 }, 85, CFG)).toMatchObject({ tierName: 'C', division: null, lp: 100 })
  })

  it('score por debajo del confirmado → rango real (más bajo)', () => {
    expect(displayedRank({ status: 'stable', tierIndex: 2 }, 30, CFG).tierIndex).toBe(1)
  })
})

// ─── 8. Inactividad ────────────────────────────────────────────────────────

describe('lastTrainedByMuscle', () => {
  it('último set efectivo por músculo, incluyendo secundarios', () => {
    const sets = [
      set('bench', 100, 5, daysAgo(10)),
      set('bench', 100, 5, daysAgo(3)),
      set('pullup', 0, 5, daysAgo(20)),
      set('pullup', 0, 5, daysAgo(1), { isWarmup: true }),
      set('bench', 100, 5, NOW + DAY_MS),
    ]
    const last = lastTrainedByMuscle(sets, EM, NOW)
    expect(last.get('chest')).toBe(daysAgo(3))
    expect(last.get('triceps')).toBe(daysAgo(3))
    expect(last.get('lats')).toBe(daysAgo(20))
    expect(last.get('biceps')).toBe(daysAgo(20))
    expect(last.has('quads')).toBe(false)
  })
})

describe('isInactive', () => {
  it.each([
    [daysAgo(0), false],
    [daysAgo(14), false],
    [daysAgo(14) - 1, true],
    [daysAgo(30), true],
  ])('último %d → %s', (last, expected) => {
    expect(isInactive(last, NOW)).toBe(expected)
  })

  it('nunca entrenado no cuenta como inactivo', () => {
    expect(isInactive(undefined, NOW)).toBe(false)
  })

  it('umbral configurable', () => {
    expect(isInactive(daysAgo(8), NOW, 7)).toBe(true)
  })
})

// ─── Cálculo completo ──────────────────────────────────────────────────────

describe('computeRankings', () => {
  const muscleIds = ['chest', 'triceps', 'lats', 'biceps', 'quads']

  it('combina fuerza, constancia, global, eslabón débil e inactividad', () => {
    // 80 kg. bench 1RM 80 → ratio 1 → 50; fly 1RM 32 → ratio 0.4 → 30. Pecho fuerza = 40.
    const sets: RankedSet[] = [
      ...Array.from({ length: 5 }, () => set('bench', 80, 1, daysAgo(1))),
      ...Array.from({ length: 5 }, () => set('fly', 32, 1, daysAgo(2))),
      // dominadas hace 20 días: entra en fuerza (42 d) pero no en constancia (7 d)
      set('pullup', 0, 1, daysAgo(20)), // 80/80 = 1 → (1-0.8)/(1-0.8)... = 30
    ]
    const r = computeRankings({ sets, exerciseMuscles: EM, muscleIds, bodyweightKg: 80, sex: 'male', now: NOW }, STD)

    const by = Object.fromEntries(r.muscles.map((m) => [m.muscleId, m]))
    expect(r.muscles.map((m) => m.muscleId)).toEqual(muscleIds)

    expect(by.chest!.strengthScore).toBeCloseTo(40)
    expect(by.chest!.effectiveSets).toBe(10)
    expect(by.chest!.consistencyScore).toBe(100)
    expect(by.chest!.score).toBeCloseTo(52)
    expect(by.chest!.rank?.tierName).toBe('Platino')
    expect(by.chest!.inactive).toBe(false)

    expect(by.triceps!.strengthScore).toBeCloseTo(50)
    expect(by.triceps!.effectiveSets).toBe(2.5)
    expect(by.triceps!.score).toBeCloseTo(0.8 * 50 + 0.2 * 25)

    expect(by.lats!.strengthScore).toBeCloseTo(30)
    expect(by.lats!.effectiveSets).toBe(0)
    expect(by.lats!.score).toBeCloseTo(24)
    expect(by.lats!.inactive).toBe(true)
    expect(by.lats!.lastTrainedAt).toBe(daysAgo(20))

    expect(by.quads!.score).toBeNull()
    expect(by.quads!.rank).toBeNull()
    expect(by.quads!.inactive).toBe(false)

    expect(r.global.trainedMuscles).toBe(4)
    expect(r.global.weakLink?.muscleId).toBe('lats')
    expect(r.global.score).toBeCloseTo((52 + 45 + 24 + 24) / 4)

    expect(r.exercises.get('bench')).toMatchObject({ e1rm: 80, score: 50 })
    expect(r.exercises.get('pullup')).toMatchObject({ e1rm: 80 })
  })

  it('ejercicios sin estándar suman constancia pero no dan rango', () => {
    const sets = Array.from({ length: 12 }, () => set('pushup', 0, 20, daysAgo(1)))
    const r = computeRankings({ sets, exerciseMuscles: EM, muscleIds: ['chest'], bodyweightKg: 80, sex: 'male', now: NOW }, STD)
    expect(r.muscles[0]).toMatchObject({ effectiveSets: 12, consistencyScore: 100, strengthScore: null, score: null })
    expect(r.exercises.get('pushup')).toBeUndefined() // sin carga → sin e1RM
    expect(r.global.rank).toBeNull()
  })

  it('sin peso corporal no hay scores de fuerza', () => {
    const r = computeRankings({ sets: [set('bench', 100, 5)], exerciseMuscles: EM, muscleIds: ['chest'], sex: 'male', now: NOW }, STD)
    expect(r.muscles[0]!.score).toBeNull()
    expect(r.exercises.get('bench')?.score).toBeNull()
  })

  it('sin datos → todo vacío', () => {
    const r = computeRankings({ sets: [], exerciseMuscles: EM, muscleIds, bodyweightKg: 80, sex: 'female', now: NOW }, STD)
    expect(r.muscles.every((m) => m.rank === null && !m.inactive)).toBe(true)
    expect(r.global.rank).toBeNull()
  })

  it('el sexo cambia el score', () => {
    const input = { sets: [set('bench', 80, 1)], exerciseMuscles: EM, muscleIds: ['chest'], bodyweightKg: 80, now: NOW }
    const m = computeRankings({ ...input, sex: 'male' }, STD).muscles[0]!.strengthScore!
    const f = computeRankings({ ...input, sex: 'female' }, STD).muscles[0]!.strengthScore!
    expect(f).toBeGreaterThan(m)
  })

  it('funciona con el catálogo y config reales', () => {
    const em: ExerciseMuscle[] = [{ exerciseId: 'back_squat', muscleId: 'quads', factor: 1 }]
    const sets = Array.from({ length: 12 }, () => set('back_squat', 120, 1, daysAgo(2))) // ratio 1.5 = intermedio
    const r = computeRankings({ sets, exerciseMuscles: em, muscleIds: ['quads'], bodyweightKg: 80, sex: 'male', now: NOW })
    // fuerza 50, constancia 100 → 60 → Esmeralda IV
    expect(r.muscles[0]!.score).toBeCloseTo(60)
    expect(formatRank(r.muscles[0]!.rank!)).toBe('Esmeralda IV')
  })
})

// ─── 9. diffRanks ──────────────────────────────────────────────────────────

describe('diffRanks', () => {
  const R = (score: number) => rankFromScore(score)

  it('LP ganados dentro de la misma división', () => {
    const [d] = diffRanks({ chest: R(37) }, { chest: R(37.6) })
    expect(d).toMatchObject({ id: 'chest', change: 'same', lpDelta: 20 })
  })

  it('subida de división', () => {
    const [d] = diffRanks({ chest: R(38.7) }, { chest: R(39.3) }) // Oro IV 90 → Oro III 10
    expect(d).toMatchObject({ change: 'division_up', lpDelta: 20 })
  })

  it('bajada de división', () => {
    const [d] = diffRanks({ chest: R(39.3) }, { chest: R(38.7) })
    expect(d).toMatchObject({ change: 'division_down', lpDelta: -20 })
  })

  it('ascenso y descenso de tier', () => {
    expect(diffRanks({ a: R(35) }, { a: R(37) })[0]).toMatchObject({ change: 'promoted' })
    expect(diffRanks({ a: R(37) }, { a: R(35) })[0]).toMatchObject({ change: 'demoted' })
    // Diamante I 99 → Maestro 0 = +1 LP
    expect(diffRanks({ a: R(83.99) }, { a: R(84) })[0]).toMatchObject({ change: 'promoted', lpDelta: 1 })
  })

  it('nuevo y perdido valen 0 LP; omite claves sin rango en ambos', () => {
    const d = diffRanks({ a: null, b: R(40), c: null }, { a: R(20), b: null, c: undefined })
    expect(d).toEqual([
      { id: 'a', before: null, after: R(20), lpDelta: 0, change: 'new' },
      { id: 'b', before: R(40), after: null, lpDelta: 0, change: 'lost' },
    ])
  })

  it('ordena por LP descendente', () => {
    const d = diffRanks({ a: R(30), b: R(30), c: R(30) }, { a: R(30.3), b: R(31), c: R(29) })
    expect(d.map((x) => x.id)).toEqual(['b', 'a', 'c'])
  })

  it('resumen post-entreno: antes vs después del entreno con computeRankings', () => {
    const base = { exerciseMuscles: EM, muscleIds: ['chest', 'triceps', 'lats'], bodyweightKg: 80, sex: 'male' as const }
    const old = Array.from({ length: 6 }, () => set('bench', 70, 1, daysAgo(3)))
    const workout = Array.from({ length: 4 }, () => set('bench', 80, 1, NOW))

    const before = rankSnapshot(computeRankings({ ...base, sets: old, now: NOW - 1 }, STD))
    const after = rankSnapshot(computeRankings({ ...base, sets: [...old, ...workout], now: NOW }, STD))
    const diff = diffRanks(before, after)

    const chest = diff.find((d) => d.id === 'chest')!
    expect(chest.lpDelta).toBeGreaterThan(0)
    expect(diff.find((d) => d.id === 'global')!.lpDelta).toBeGreaterThan(0)
    expect(diff.find((d) => d.id === 'lats')).toBeUndefined()
  })
})

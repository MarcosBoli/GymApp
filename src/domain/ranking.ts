/**
 * Sistema de rangos por músculo estilo LoL/Valorant. Todo puro: el "ahora" y los
 * datos entran por parámetro; la configuración por defecto sale de src/data/*.json.
 */
import type { ExerciseMuscle, Sex, Timestamp, WorkoutSet } from './types'
import { RANK_CONFIG, STRENGTH_STANDARDS } from '../data/ranking'

export const DAY_MS = 86_400_000

// ─── Tipos de configuración ────────────────────────────────────────────────

/** Valores para [principiante, novato, intermedio, avanzado, élite]. */
export type Levels5 = [number, number, number, number, number]

export interface ExerciseStandard {
  /** Carga = peso corporal + lastre (dominadas, fondos). */
  addBodyweight?: boolean
  male: Levels5
  female: Levels5
}

export interface StrengthStandards {
  levels: string[]
  /** Score que corresponde a alcanzar cada nivel. */
  levelScores: Levels5
  exercises: Record<string, ExerciseStandard>
}

export interface TierConfig {
  id: string
  name: string
  /** Score mínimo (incluido) para entrar en el tier. */
  minScore: number
  /** Color del rango en el mapa corporal (hex). */
  color: string
}

export interface RankConfig {
  e1rm: { maxReps: number }
  windows: { strengthDays: number; consistencyDays: number; inactivityDays: number }
  weights: { strength: number; consistency: number }
  consistency: {
    optimalMinSets: number
    optimalMaxSets: number
    overreachSets: number
    overreachScore: number
  }
  promotion: { sessions: number; winsNeeded: number }
  /** Ordenados por minScore ascendente; el primero empieza en 0. */
  tiers: TierConfig[]
}

export type RankedSet = Pick<
  WorkoutSet,
  'id' | 'exerciseId' | 'performedAt' | 'reps' | 'weightKg' | 'isWarmup'
>

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x))
const EPS = 1e-9

// ─── 1. e1RM (Epley) ───────────────────────────────────────────────────────

/**
 * e1RM de Epley: carga × (1 + reps/30). Con 1 rep devuelve la carga.
 * Las reps se limitan a maxReps porque Epley sobreestima en series largas.
 * null si no hay carga positiva o reps < 1.
 */
export function epley(loadKg: number, reps: number, maxReps = RANK_CONFIG.e1rm.maxReps): number | null {
  if (!(loadKg > 0) || !(reps >= 1)) return null
  const r = Math.min(Math.floor(reps), maxReps)
  return r === 1 ? loadKg : loadKg * (1 + r / 30)
}

/**
 * e1RM de una serie. Ignora calentamientos. Con addBodyweight la carga es
 * peso corporal + lastre (un lastre negativo = asistencia).
 */
export function setE1RM(
  set: Pick<WorkoutSet, 'reps' | 'weightKg' | 'isWarmup'>,
  opts: { addBodyweight?: boolean; bodyweightKg?: number; maxReps?: number } = {},
): number | null {
  if (set.isWarmup) return null
  let load = set.weightKg
  if (opts.addBodyweight) {
    if (!(opts.bodyweightKg !== undefined && opts.bodyweightKg > 0)) return null
    load += opts.bodyweightKg
  }
  return epley(load, set.reps, opts.maxReps)
}

// ─── 2. Mejor e1RM por ejercicio en ventana ────────────────────────────────

export interface BestE1RM {
  exerciseId: string
  e1rm: number
  setId: string
  performedAt: Timestamp
}

const inWindow = (t: Timestamp, now: Timestamp, days: number) => t <= now && t >= now - days * DAY_MS

/** Mejor e1RM de cada ejercicio con series en [now - windowDays, now]. */
export function bestE1RMByExercise(
  sets: readonly RankedSet[],
  opts: {
    now: Timestamp
    bodyweightKg?: number
    windowDays?: number
    standards?: StrengthStandards
    maxReps?: number
  },
): Map<string, BestE1RM> {
  const { now, bodyweightKg, windowDays = RANK_CONFIG.windows.strengthDays, standards = STRENGTH_STANDARDS, maxReps } = opts
  const best = new Map<string, BestE1RM>()
  for (const s of sets) {
    if (!inWindow(s.performedAt, now, windowDays)) continue
    const addBodyweight = standards.exercises[s.exerciseId]?.addBodyweight ?? false
    const e1rm = setE1RM(s, { addBodyweight, bodyweightKg, maxReps })
    if (e1rm === null) continue
    const current = best.get(s.exerciseId)
    if (!current || e1rm > current.e1rm) {
      best.set(s.exerciseId, { exerciseId: s.exerciseId, e1rm, setId: s.id, performedAt: s.performedAt })
    }
  }
  return best
}

// ─── 3. Score por ejercicio ────────────────────────────────────────────────

/**
 * Interpola linealmente el ratio e1RM/peso corporal contra los 5 umbrales,
 * partiendo de (0, 0). Por encima de élite se queda en el score máximo.
 */
export function scoreFromRatio(ratio: number, thresholds: Levels5, levelScores: Levels5): number {
  if (!(ratio > 0)) return 0
  let prevRatio = 0
  let prevScore = 0
  for (let i = 0; i < thresholds.length; i++) {
    const t = thresholds[i]!
    const s = levelScores[i]!
    if (ratio <= t) return prevScore + ((ratio - prevRatio) / (t - prevRatio)) * (s - prevScore)
    prevRatio = t
    prevScore = s
  }
  return prevScore
}

/** Score 0-100 de un ejercicio; null si no tiene estándar o falta el peso corporal. */
export function exerciseScore(
  exerciseId: string,
  e1rm: number,
  bodyweightKg: number | undefined,
  sex: Sex,
  standards: StrengthStandards = STRENGTH_STANDARDS,
): number | null {
  const std = standards.exercises[exerciseId]
  if (!std || !(bodyweightKg !== undefined && bodyweightKg > 0)) return null
  return clamp(scoreFromRatio(e1rm / bodyweightKg, std[sex], standards.levelScores), 0, 100)
}

// ─── 4. Score por músculo ──────────────────────────────────────────────────

/** Media ponderada por factor (1 / 0.5) de los scores de los ejercicios del músculo. */
export function muscleStrengthScore(
  muscleId: string,
  exerciseScores: ReadonlyMap<string, number>,
  exerciseMuscles: readonly ExerciseMuscle[],
): number | null {
  let sum = 0
  let weight = 0
  for (const em of exerciseMuscles) {
    if (em.muscleId !== muscleId) continue
    const score = exerciseScores.get(em.exerciseId)
    if (score === undefined) continue
    sum += score * em.factor
    weight += em.factor
  }
  return weight > 0 ? sum / weight : null
}

const isEffective = (s: Pick<WorkoutSet, 'isWarmup' | 'reps'>) => !s.isWarmup && s.reps >= 1

/** Series efectivas por músculo en la ventana; las de músculo secundario cuentan su factor (0.5). */
export function effectiveSetsByMuscle(
  sets: readonly RankedSet[],
  exerciseMuscles: readonly ExerciseMuscle[],
  opts: { now: Timestamp; windowDays?: number },
): Map<string, number> {
  const { now, windowDays = RANK_CONFIG.windows.consistencyDays } = opts
  const byExercise = groupByExercise(exerciseMuscles)
  const out = new Map<string, number>()
  for (const s of sets) {
    if (!isEffective(s) || !inWindow(s.performedAt, now, windowDays)) continue
    for (const em of byExercise.get(s.exerciseId) ?? []) {
      out.set(em.muscleId, (out.get(em.muscleId) ?? 0) + em.factor)
    }
  }
  return out
}

/** 0 series → 0; sube lineal hasta 100 en el óptimo; >óptimo baja hasta overreachScore. */
export function consistencyScore(effectiveSets: number, cfg = RANK_CONFIG.consistency): number {
  const { optimalMinSets, optimalMaxSets, overreachSets, overreachScore } = cfg
  if (!(effectiveSets > 0)) return 0
  if (effectiveSets < optimalMinSets) return (effectiveSets / optimalMinSets) * 100
  if (effectiveSets <= optimalMaxSets) return 100
  if (effectiveSets >= overreachSets) return overreachScore
  const t = (effectiveSets - optimalMaxSets) / (overreachSets - optimalMaxSets)
  return 100 - t * (100 - overreachScore)
}

/** Score final del músculo: 80 % fuerza + 20 % constancia (pesos configurables). */
export function combineMuscleScore(
  strength: number,
  consistency: number,
  weights = RANK_CONFIG.weights,
): number {
  return clamp(strength * weights.strength + consistency * weights.consistency, 0, 100)
}

// ─── 5. Score → tier, división y LP ────────────────────────────────────────

/** Cada tier tiene 3 divisiones: III (entrada) → II → I (la más alta). */
export type Division = 'III' | 'II' | 'I'
export const DIVISIONS: readonly Division[] = ['III', 'II', 'I']

export interface Rank {
  tierIndex: number
  tierId: string
  tierName: string
  division: Division
  /** 0-99 (100 solo en el tope del último tier o durante una promo). */
  lp: number
  score: number
}

export function tierIndexForScore(score: number, config: RankConfig = RANK_CONFIG): number {
  const s = clamp(score, 0, 100)
  let index = 0
  config.tiers.forEach((t, i) => {
    if (s >= t.minScore) index = i
  })
  return index
}

const tierBounds = (i: number, config: RankConfig) => ({
  min: config.tiers[i]!.minScore,
  max: config.tiers[i + 1]?.minScore ?? 100,
})

export function rankFromScore(score: number, config: RankConfig = RANK_CONFIG): Rank {
  const s = clamp(score, 0, 100)
  const tierIndex = tierIndexForScore(s, config)
  const tier = config.tiers[tierIndex]!
  const isTop = tierIndex === config.tiers.length - 1
  const { min, max } = tierBounds(tierIndex, config)
  const width = max - min
  const offset = s - min
  const maxLp = isTop ? 100 : 99

  const divWidth = width / DIVISIONS.length
  const divIndex = Math.min(DIVISIONS.length - 1, Math.floor(offset / divWidth + EPS))
  const lp = Math.floor(((offset - divIndex * divWidth) / divWidth) * 100 + EPS)
  return {
    tierIndex,
    tierId: tier.id,
    tierName: tier.name,
    division: DIVISIONS[divIndex]!,
    lp: clamp(lp, 0, maxLp),
    score: s,
  }
}

/** Rango en lo más alto de un tier (división I, 100 LP). Usado durante promos. */
export function rankAtTierTop(tierIndex: number, score: number, lp: number, config: RankConfig = RANK_CONFIG): Rank {
  const tier = config.tiers[tierIndex]!
  return {
    tierIndex,
    tierId: tier.id,
    tierName: tier.name,
    division: 'I',
    lp,
    score: clamp(score, 0, 100),
  }
}

/** Posición absoluta en la escalera: cada división = 100 LP. */
export function ladderPoints(rank: Rank, _config: RankConfig = RANK_CONFIG): number {
  return rank.tierIndex * DIVISIONS.length * 100 + DIVISIONS.indexOf(rank.division) * 100 + rank.lp
}

/** Pips encendidos de la insignia: III → 1, II → 2, I → 3. */
export const divisionPips = (division: Division): number => DIVISIONS.indexOf(division) + 1

export function formatRank(rank: Rank): string {
  return `${rank.tierName} ${rank.division}`
}

// ─── 6. Rango global y eslabón débil ───────────────────────────────────────

export interface GlobalRank {
  score: number | null
  rank: Rank | null
  trainedMuscles: number
  /** Músculo entrenado con menor score (empate → el primero en el orden dado). */
  weakLink: { muscleId: string; score: number } | null
}

/** Media de los músculos entrenados (score no nulo). */
export function globalRank(
  muscleScores: ReadonlyArray<readonly [muscleId: string, score: number | null]>,
  config: RankConfig = RANK_CONFIG,
): GlobalRank {
  const trained = muscleScores.filter((e): e is readonly [string, number] => e[1] !== null)
  if (trained.length === 0) return { score: null, rank: null, trainedMuscles: 0, weakLink: null }
  const score = trained.reduce((sum, [, s]) => sum + s, 0) / trained.length
  let weak = trained[0]!
  for (const e of trained) if (e[1] < weak[1]) weak = e
  return {
    score,
    rank: rankFromScore(score, config),
    trainedMuscles: trained.length,
    weakLink: { muscleId: weak[0], score: weak[1] },
  }
}

// ─── 7. Series de promoción ────────────────────────────────────────────────

export type PromotionState =
  | { status: 'stable'; tierIndex: number }
  | { status: 'promo'; tierIndex: number; targetTierIndex: number; wins: number; losses: number }

/**
 * Avanza el estado tras una sesión que entrena el músculo, con el score resultante.
 * - Sin estado previo: colocación directa en el tier del score.
 * - Cruzar hacia arriba el umbral del tier confirmado abre una promo (esa sesión no cuenta).
 * - En promo: cada sesión con tier ≥ objetivo es victoria; con winsNeeded victorias
 *   en `sessions` sesiones se confirma el ascenso; si ya no es posible, se falla y se
 *   queda en el tier confirmado (o más abajo si el score actual lo está).
 * - Bajar de tier es inmediato (sin protección).
 */
export function advancePromotion(
  state: PromotionState | undefined,
  score: number,
  config: RankConfig = RANK_CONFIG,
): PromotionState {
  const tier = tierIndexForScore(score, config)
  if (!state) return { status: 'stable', tierIndex: tier }

  if (state.status === 'stable') {
    if (tier > state.tierIndex) {
      return { status: 'promo', tierIndex: state.tierIndex, targetTierIndex: tier, wins: 0, losses: 0 }
    }
    return { status: 'stable', tierIndex: tier }
  }

  const { sessions, winsNeeded } = config.promotion
  const won = tier >= state.targetTierIndex
  const wins = state.wins + (won ? 1 : 0)
  const losses = state.losses + (won ? 0 : 1)
  if (wins >= winsNeeded) return { status: 'stable', tierIndex: state.targetTierIndex }
  const remaining = sessions - wins - losses
  if (wins + remaining < winsNeeded) {
    return { status: 'stable', tierIndex: Math.min(state.tierIndex, tier) }
  }
  return { ...state, wins, losses }
}

/** Aplica una secuencia de scores de sesión (en orden cronológico). */
export function replayPromotion(
  scores: readonly number[],
  config: RankConfig = RANK_CONFIG,
  initial?: PromotionState,
): PromotionState | undefined {
  return scores.reduce<PromotionState | undefined>((st, s) => advancePromotion(st, s, config), initial)
}

/**
 * Rango a mostrar teniendo en cuenta la promo: nunca por encima del tier confirmado.
 * Con el score por encima del tier confirmado se muestra su tope (100 LP en promo).
 */
export function displayedRank(state: PromotionState, score: number, config: RankConfig = RANK_CONFIG): Rank {
  const raw = rankFromScore(score, config)
  if (raw.tierIndex <= state.tierIndex) return raw
  return rankAtTierTop(state.tierIndex, score, state.status === 'promo' ? 100 : 99, config)
}

// ─── 8. Inactividad ────────────────────────────────────────────────────────

/** Último instante con una serie efectiva para cada músculo (cualquier factor), hasta `now`. */
export function lastTrainedByMuscle(
  sets: readonly RankedSet[],
  exerciseMuscles: readonly ExerciseMuscle[],
  now: Timestamp,
): Map<string, Timestamp> {
  const byExercise = groupByExercise(exerciseMuscles)
  const out = new Map<string, Timestamp>()
  for (const s of sets) {
    if (!isEffective(s) || s.performedAt > now) continue
    for (const em of byExercise.get(s.exerciseId) ?? []) {
      const prev = out.get(em.muscleId)
      if (prev === undefined || s.performedAt > prev) out.set(em.muscleId, s.performedAt)
    }
  }
  return out
}

/** true si lleva MÁS de `days` días sin entrenarse. Nunca entrenado → false (no es inactividad). */
export function isInactive(
  lastTrainedAt: Timestamp | undefined,
  now: Timestamp,
  days = RANK_CONFIG.windows.inactivityDays,
): boolean {
  return lastTrainedAt !== undefined && now - lastTrainedAt > days * DAY_MS
}

// ─── Cálculo completo ──────────────────────────────────────────────────────

export interface MuscleRanking {
  muscleId: string
  /** null si no hay ejercicios con estándar en la ventana de fuerza → músculo sin rango. */
  strengthScore: number | null
  effectiveSets: number
  consistencyScore: number
  score: number | null
  rank: Rank | null
  lastTrainedAt?: Timestamp
  inactive: boolean
}

export interface Rankings {
  muscles: MuscleRanking[]
  global: GlobalRank
  exercises: Map<string, BestE1RM & { score: number | null }>
}

export interface RankingInput {
  sets: readonly RankedSet[]
  exerciseMuscles: readonly ExerciseMuscle[]
  /** Músculos a evaluar, en orden de presentación. */
  muscleIds: readonly string[]
  bodyweightKg?: number
  sex: Sex
  now: Timestamp
}

export function computeRankings(
  input: RankingInput,
  standards: StrengthStandards = STRENGTH_STANDARDS,
  config: RankConfig = RANK_CONFIG,
): Rankings {
  const { sets, exerciseMuscles, muscleIds, bodyweightKg, sex, now } = input

  const best = bestE1RMByExercise(sets, {
    now,
    bodyweightKg,
    windowDays: config.windows.strengthDays,
    standards,
    maxReps: config.e1rm.maxReps,
  })
  const exercises = new Map<string, BestE1RM & { score: number | null }>()
  const exerciseScores = new Map<string, number>()
  for (const [id, b] of best) {
    const score = exerciseScore(id, b.e1rm, bodyweightKg, sex, standards)
    exercises.set(id, { ...b, score })
    if (score !== null) exerciseScores.set(id, score)
  }

  const effSets = effectiveSetsByMuscle(sets, exerciseMuscles, { now, windowDays: config.windows.consistencyDays })
  const lastTrained = lastTrainedByMuscle(sets, exerciseMuscles, now)

  const muscles = muscleIds.map((muscleId): MuscleRanking => {
    const strengthScore = muscleStrengthScore(muscleId, exerciseScores, exerciseMuscles)
    const effectiveSets = effSets.get(muscleId) ?? 0
    const cScore = consistencyScore(effectiveSets, config.consistency)
    const score = strengthScore === null ? null : combineMuscleScore(strengthScore, cScore, config.weights)
    const lastTrainedAt = lastTrained.get(muscleId)
    return {
      muscleId,
      strengthScore,
      effectiveSets,
      consistencyScore: cScore,
      score,
      rank: score === null ? null : rankFromScore(score, config),
      lastTrainedAt,
      inactive: isInactive(lastTrainedAt, now, config.windows.inactivityDays),
    }
  })

  return {
    muscles,
    global: globalRank(muscles.map((m) => [m.muscleId, m.score] as const), config),
    exercises,
  }
}

// ─── 9. Diferencias para el resumen post-entreno ───────────────────────────

export type RankSnapshot = Record<string, Rank | null | undefined>

export type RankChange = 'promoted' | 'demoted' | 'division_up' | 'division_down' | 'same' | 'new' | 'lost'

export interface RankDiff {
  id: string
  before: Rank | null
  after: Rank | null
  /** LP ganados (+) o perdidos (-) en la escalera absoluta; 0 en 'new' y 'lost'. */
  lpDelta: number
  change: RankChange
}

/** Construye un snapshot { músculo → rango, global → rango } a partir de un cálculo. */
export function rankSnapshot(rankings: Rankings, globalKey = 'global'): RankSnapshot {
  const snap: RankSnapshot = {}
  for (const m of rankings.muscles) snap[m.muscleId] = m.rank
  snap[globalKey] = rankings.global.rank
  return snap
}

/**
 * LP ganados/perdidos por clave entre dos snapshots. Omite las claves sin rango
 * en ambos. Ordenado por lpDelta descendente (mayor subida primero).
 */
export function diffRanks(before: RankSnapshot, after: RankSnapshot, config: RankConfig = RANK_CONFIG): RankDiff[] {
  const ids = [...new Set([...Object.keys(after), ...Object.keys(before)])]
  const diffs: RankDiff[] = []
  for (const id of ids) {
    const b = before[id] ?? null
    const a = after[id] ?? null
    if (!a && !b) continue
    let change: RankChange
    let lpDelta: number
    if (!b) {
      change = 'new'
      lpDelta = 0
    } else if (!a) {
      change = 'lost'
      lpDelta = 0
    } else {
      lpDelta = ladderPoints(a, config) - ladderPoints(b, config)
      if (a.tierIndex > b.tierIndex) change = 'promoted'
      else if (a.tierIndex < b.tierIndex) change = 'demoted'
      else if (a.division !== b.division) change = lpDelta > 0 ? 'division_up' : 'division_down'
      else change = 'same'
    }
    diffs.push({ id, before: b, after: a, lpDelta, change })
  }
  return diffs.sort((x, y) => y.lpDelta - x.lpDelta)
}

// ─── util ──────────────────────────────────────────────────────────────────

function groupByExercise(exerciseMuscles: readonly ExerciseMuscle[]): Map<string, ExerciseMuscle[]> {
  const map = new Map<string, ExerciseMuscle[]>()
  for (const em of exerciseMuscles) {
    const list = map.get(em.exerciseId)
    if (list) list.push(em)
    else map.set(em.exerciseId, [em])
  }
  return map
}

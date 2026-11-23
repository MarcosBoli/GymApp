/**
 * Gasto energético y objetivos. Todo puro: "hoy" y los datos entran por parámetro.
 */
import type { ActivityLevel, DateKey, Goal, Sex } from './types'
import { addDays, dateRange, daysBetweenKeys } from './dates'
import { ZERO_NUTRITION, type Nutrition } from './food'

/** kcal por kg de peso corporal (aprox. tejido mixto). */
export const KCAL_PER_KG = 7700
export const TREND_ALPHA = 0.1
export const ADAPTIVE_WINDOW_DAYS = 14
export const MIN_LOGGED_DAYS = 10
export const MIN_WEIGH_INS = 2

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

/** Ajuste sobre el TDEE según objetivo. */
export const GOAL_FACTORS: Record<Goal, number> = { lose: 0.8, maintain: 1, gain: 1.1 }
export const MIN_TARGET_KCAL = 1200
export const PROTEIN_G_PER_KG = 2
export const FAT_KCAL_SHARE = 0.25

// ─── BMR y TDEE inicial ────────────────────────────────────────────────────

/** Edad en años cumplidos en la fecha dada. */
export function ageOn(birthDate: DateKey, on: DateKey): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number]
  const [y, m, d] = on.split('-').map(Number) as [number, number, number]
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

/** Mifflin-St Jeor: 10·kg + 6,25·cm − 5·edad + 5 (hombre) / − 161 (mujer). */
export function bmrMifflin(p: { sex: Sex; weightKg: number; heightCm: number; ageYears: number }): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.ageYears + (p.sex === 'male' ? 5 : -161)
}

export const initialTdee = (bmr: number, activity: ActivityLevel) => bmr * ACTIVITY_FACTORS[activity]

// ─── Peso tendencial ───────────────────────────────────────────────────────

export interface WeightLog {
  date: DateKey
  weightKg: number
}

export interface TrendPoint {
  date: DateKey
  /** Peso registrado ese día (si lo hay). */
  weightKg?: number
  trendKg: number
}

/**
 * Media móvil exponencial diaria (trend = trend + α·(peso − trend)), desde el primer
 * pesaje hasta el último. Los días sin pesaje se rellenan interpolando linealmente
 * entre pesajes para que los huecos no frenen ni aceleren la tendencia.
 */
export function weightTrend(logs: readonly WeightLog[], alpha = TREND_ALPHA): TrendPoint[] {
  const byDate = new Map<DateKey, number>()
  for (const l of [...logs].sort((a, b) => a.date.localeCompare(b.date))) byDate.set(l.date, l.weightKg)
  const dates = [...byDate.keys()]
  if (dates.length === 0) return []

  const out: TrendPoint[] = []
  let trend = byDate.get(dates[0]!)!
  let next = 0 // índice del siguiente pesaje real
  for (const date of dateRange(dates[0]!, dates.at(-1)!)) {
    while (dates[next]! < date) next++
    const actual = byDate.get(date)
    let value: number
    if (actual !== undefined) value = actual
    else {
      const prevDate = dates[next - 1]!
      const nextDate = dates[next]!
      const t = daysBetweenKeys(prevDate, date) / daysBetweenKeys(prevDate, nextDate)
      value = byDate.get(prevDate)! + t * (byDate.get(nextDate)! - byDate.get(prevDate)!)
    }
    trend = out.length === 0 ? value : trend + alpha * (value - trend)
    out.push(actual !== undefined ? { date, weightKg: actual, trendKg: trend } : { date, trendKg: trend })
  }
  return out
}

/** Tendencia en una fecha: undefined antes del primer pesaje; tras el último, se mantiene. */
export function trendOn(trend: readonly TrendPoint[], date: DateKey): number | undefined {
  if (trend.length === 0 || date < trend[0]!.date) return undefined
  if (date >= trend.at(-1)!.date) return trend.at(-1)!.trendKg
  return trend.find((p) => p.date === date)?.trendKg
}

// ─── TDEE adaptativo ───────────────────────────────────────────────────────

export interface DailyIntake {
  date: DateKey
  kcal: number
}

export type AdaptiveTdee =
  | { status: 'ok'; tdee: number; avgIntake: number; trendChangeKg: number; loggedDays: number; weighIns: number }
  | { status: 'insufficient'; reason: 'intake' | 'weight' | 'history'; loggedDays: number; weighIns: number }

/**
 * TDEE = kcal medias ingeridas − (cambio del peso tendencial × 7700 / días).
 * Ventana de `windowDays` días que termina hoy. El cambio de peso se mide desde el
 * día anterior a la ventana hasta hoy (exactamente `windowDays` días).
 * - Ingesta media solo de los días con comida registrada (un día vacío es un olvido);
 *   hacen falta al menos `minLoggedDays`.
 * - Hacen falta `minWeighIns` pesajes en la ventana y algún pesaje anterior a ella.
 */
export function adaptiveTdee(input: {
  intake: readonly DailyIntake[]
  weights: readonly WeightLog[]
  today: DateKey
  windowDays?: number
  minLoggedDays?: number
  minWeighIns?: number
  alpha?: number
}): AdaptiveTdee {
  const { intake, weights, today, windowDays = ADAPTIVE_WINDOW_DAYS, minLoggedDays = MIN_LOGGED_DAYS, minWeighIns = MIN_WEIGH_INS, alpha } = input
  const start = addDays(today, -(windowDays - 1))
  const before = addDays(start, -1)

  const logged = intake.filter((d) => d.date >= start && d.date <= today && d.kcal > 0)
  const weighIns = new Set(weights.filter((w) => w.date >= start && w.date <= today).map((w) => w.date)).size
  const fail = (reason: 'intake' | 'weight' | 'history') => ({ status: 'insufficient' as const, reason, loggedDays: logged.length, weighIns })

  if (logged.length < minLoggedDays) return fail('intake')
  if (weighIns < minWeighIns) return fail('weight')

  const trend = weightTrend(weights.filter((w) => w.date <= today), alpha)
  const trendBefore = trendOn(trend, before)
  const trendEnd = trendOn(trend, today)
  if (trendBefore === undefined || trendEnd === undefined) return fail('history')

  const avgIntake = logged.reduce((s, d) => s + d.kcal, 0) / logged.length
  const trendChangeKg = trendEnd - trendBefore
  return {
    status: 'ok',
    tdee: avgIntake - (trendChangeKg * KCAL_PER_KG) / windowDays,
    avgIntake,
    trendChangeKg,
    loggedDays: logged.length,
    weighIns,
  }
}

// ─── Objetivos ─────────────────────────────────────────────────────────────

export function calorieTarget(tdee: number, goal: Goal): number {
  return Math.max(MIN_TARGET_KCAL, Math.round(tdee * GOAL_FACTORS[goal]))
}

/** Proteína 2 g/kg, grasa 25 % de las kcal, carbohidratos el resto. */
export function macroTargets(kcal: number, weightKg: number): Nutrition {
  const proteinG = Math.round(PROTEIN_G_PER_KG * weightKg)
  const fatG = Math.round((kcal * FAT_KCAL_SHARE) / 9)
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4))
  return { kcal, proteinG, carbsG, fatG }
}

// ─── Balance semanal ───────────────────────────────────────────────────────

export interface BalanceDay {
  date: DateKey
  /** null si ese día no hay comida registrada. */
  kcal: number | null
  balance: number | null
  /** Hoy: día aún en curso. */
  partial: boolean
}

export interface WeeklyBalance {
  days: BalanceDay[]
  /** Suma de (ingesta − TDEE) de los días completos con registros (sin contar hoy). */
  totalBalance: number
  completeLoggedDays: number
  estimatedKgChange: number
}

export function weeklyBalance(intake: readonly DailyIntake[], tdee: number, today: DateKey, days = 7): WeeklyBalance {
  const byDate = new Map(intake.map((d) => [d.date, d.kcal]))
  const list = dateRange(addDays(today, -(days - 1)), today).map((date): BalanceDay => {
    const kcal = byDate.get(date)
    const logged = kcal !== undefined && kcal > 0
    return { date, kcal: logged ? kcal : null, balance: logged ? kcal - tdee : null, partial: date === today }
  })
  const complete = list.filter((d) => !d.partial && d.balance !== null)
  const totalBalance = complete.reduce((s, d) => s + d.balance!, 0)
  return { days: list, totalBalance, completeLoggedDays: complete.length, estimatedKgChange: totalBalance / KCAL_PER_KG }
}

// ─── Resumen para Inicio ───────────────────────────────────────────────────

export interface EnergyProfile {
  sex: Sex
  birthDate: DateKey
  heightCm: number
  activityLevel: ActivityLevel
  goal: Goal
}

export interface DayNutrition extends Nutrition {
  date: DateKey
}

export type EnergyOverview =
  | { ready: false; missing: 'profile' | 'weight'; today: Nutrition }
  | {
      ready: true
      today: Nutrition
      weightKg: number
      bmr: number
      initialTdee: number
      adaptive: AdaptiveTdee
      tdee: number
      tdeeSource: 'adaptive' | 'initial'
      target: Nutrition
      week: WeeklyBalance
    }

export function energyOverview(input: {
  profile?: EnergyProfile
  weights: readonly WeightLog[]
  days: readonly DayNutrition[]
  today: DateKey
}): EnergyOverview {
  const { profile, weights, days, today } = input
  const todayNutrition = days.find((d) => d.date === today) ?? { ...ZERO_NUTRITION }
  const todayTotals: Nutrition = { kcal: todayNutrition.kcal, proteinG: todayNutrition.proteinG, carbsG: todayNutrition.carbsG, fatG: todayNutrition.fatG }
  if (!profile) return { ready: false, missing: 'profile', today: todayTotals }

  const latest = [...weights].filter((w) => w.date <= today).sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  if (!latest) return { ready: false, missing: 'weight', today: todayTotals }

  const bmr = bmrMifflin({ sex: profile.sex, weightKg: latest.weightKg, heightCm: profile.heightCm, ageYears: ageOn(profile.birthDate, today) })
  const initial = initialTdee(bmr, profile.activityLevel)
  const intake = days.map((d) => ({ date: d.date, kcal: d.kcal }))
  const adaptive = adaptiveTdee({ intake, weights, today })
  const tdee = adaptive.status === 'ok' ? adaptive.tdee : initial
  const targetKcal = calorieTarget(tdee, profile.goal)

  return {
    ready: true,
    today: todayTotals,
    weightKg: latest.weightKg,
    bmr,
    initialTdee: initial,
    adaptive,
    tdee,
    tdeeSource: adaptive.status === 'ok' ? 'adaptive' : 'initial',
    target: macroTargets(targetKcal, latest.weightKg),
    week: weeklyBalance(intake, tdee, today),
  }
}

/** Valida el peso escrito en el registro rápido. */
export function parseBodyweight(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'))
  return text.trim() !== '' && Number.isFinite(n) && n >= 30 && n <= 300 ? Math.round(n * 10) / 10 : null
}

/** Progreso de un consumo frente a su objetivo. */
export function progressOf(consumed: number, target: number): { fraction: number; remaining: number; over: number } {
  const fraction = target > 0 ? consumed / target : 0
  return { fraction, remaining: Math.max(0, target - consumed), over: Math.max(0, consumed - target) }
}

/** Explica qué falta para el TDEE adaptativo (o confirma que se usa). */
export function adaptiveStatusText(a: AdaptiveTdee, minLoggedDays = MIN_LOGGED_DAYS, minWeighIns = MIN_WEIGH_INS): string {
  if (a.status === 'ok') return 'adaptativo (últimos 14 días)'
  if (a.reason === 'intake') return `estimado · registra comida ${a.loggedDays}/${minLoggedDays} días para el adaptativo`
  if (a.reason === 'weight') return `estimado · pésate al menos ${minWeighIns} veces en 14 días (${a.weighIns}/${minWeighIns})`
  return 'estimado · el adaptativo necesita pesajes de hace 15 días o más'
}

/**
 * Contexto del recomendador de comidas (/api/meal-suggestions): qué comida es, cuánto queda del
 * día y qué parte toca a esta comida, preferencias del perfil y comidas recientes. Todo puro.
 */
import type { DateKey, Goal, MealItem, MealType, UserProfile } from './types'
import type { Nutrition } from './food'
import type { Macros, MealPrefs, MealSuggestContext } from './mealSchema'

/** Orden del día en España: desayuno, comida, merienda (snack) y cena. */
export const DAY_ORDER: readonly MealType[] = ['breakfast', 'lunch', 'snack', 'dinner']
/** Peso de cada comida en el reparto de lo que queda. */
export const MEAL_WEIGHTS: Readonly<Record<MealType, number>> = { breakfast: 25, lunch: 35, snack: 10, dinner: 30 }
/** Por debajo de esto, lo que queda se considera "muy poco": opciones ligeras. */
export const LIGHT_KCAL = 250

/** Comida según la hora local (0-23): desayuno < 11, comida < 16, merienda < 20, cena desde las 20. */
export function mealForHour(hour: number): MealType {
  if (hour >= 5 && hour < 11) return 'breakfast'
  if (hour >= 11 && hour < 16) return 'lunch'
  if (hour >= 16 && hour < 20) return 'snack'
  return 'dinner'
}

export const suggestGoal = (goal: Goal): MealSuggestContext['objetivo'] => (goal === 'lose' ? 'deficit' : goal === 'gain' ? 'superavit' : 'mantenimiento')

const toMacros = (n: Nutrition): Macros => ({ kcal: Math.round(n.kcal), proteina: Math.round(n.proteinG), carbohidratos: Math.round(n.carbsG), grasa: Math.round(n.fatG) })

/** Lo que queda hoy: objetivo − registrado (puede ser negativo si ya se pasó). */
export const remainingToday = (target: Nutrition, consumed: Nutrition): Macros =>
  toMacros({ kcal: target.kcal - consumed.kcal, proteinG: target.proteinG - consumed.proteinG, carbsG: target.carbsG - consumed.carbsG, fatG: target.fatG - consumed.fatG })

/**
 * Parte de lo que queda para esta comida: su peso entre ella y las que faltan del día
 * (la cena se lleva todo lo que queda). Nunca negativa.
 */
export function mealTarget(remaining: Macros, meal: MealType): Macros {
  const rest = DAY_ORDER.slice(DAY_ORDER.indexOf(meal))
  const share = MEAL_WEIGHTS[meal] / rest.reduce((s, m) => s + MEAL_WEIGHTS[m], 0)
  const part = (v: number) => Math.max(0, Math.round(v * share))
  return { kcal: part(remaining.kcal), proteina: part(remaining.proteina), carbohidratos: part(remaining.carbohidratos), grasa: part(remaining.grasa) }
}

export const isLight = (remaining: Macros): boolean => remaining.kcal < LIGHT_KCAL

/** Preferencias de comida completas del perfil, o null (faltan: rellenarlas en Perfil). */
export function mealPrefsFromProfile(p: UserProfile | undefined): MealPrefs | null {
  if (!p?.diet || !p.budget || !p.utensils?.length || !p.maxCookMinutes) return null
  return { noLeGusta: (p.foodDislikes ?? '').trim(), dieta: p.diet, presupuesto: p.budget, utensilios: [...p.utensils], tiempoMaxMin: p.maxCookMinutes }
}

/** Nombres de lo comido desde `fromDate` (incluido), sin repetir, lo más reciente primero. */
export function recentMealNames(items: readonly Pick<MealItem, 'foodName' | 'date' | 'createdAt'>[], fromDate: DateKey, limit = 30): string[] {
  const sorted = items.filter((i) => (i.date ?? '') >= fromDate).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.createdAt ?? 0) - (a.createdAt ?? 0))
  const out: string[] = []
  const seen = new Set<string>()
  for (const i of sorted) {
    const key = i.foodName.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(i.foodName.trim().slice(0, 80))
    if (out.length >= limit) break
  }
  return out
}

export function buildMealSuggestContext(input: {
  meal: MealType
  goal: Goal
  target: Nutrition
  consumed: Nutrition
  prefs: MealPrefs
  recentNames: readonly string[]
  request?: string
}): MealSuggestContext {
  const remaining = remainingToday(input.target, input.consumed)
  const request = input.request?.trim().slice(0, 200)
  return {
    comida: input.meal,
    objetivo: suggestGoal(input.goal),
    quedaHoy: remaining,
    objetivoComida: mealTarget(remaining, input.meal),
    ligera: isLight(remaining),
    preferencias: input.prefs,
    ultimasComidas: input.recentNames.slice(0, 40),
    ...(request ? { peticion: request } : {}),
  }
}

import type { Food, MealItem, MealType } from './types'
import { parseDecimal } from './number'
import { normalizeText } from './workout'

export const MEAL_TYPES: { id: MealType; label: string }[] = [
  { id: 'breakfast', label: 'Desayuno' },
  { id: 'lunch', label: 'Comida' },
  { id: 'dinner', label: 'Cena' },
  { id: 'snack', label: 'Snacks' },
]

export interface Nutrition {
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

export const ZERO_NUTRITION: Nutrition = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }

/** Valores de `grams` gramos de un alimento con valores por 100 g. */
export function nutritionFor(per100: Nutrition, grams: number): Nutrition {
  const f = grams / 100
  return { kcal: per100.kcal * f, proteinG: per100.proteinG * f, carbsG: per100.carbsG * f, fatG: per100.fatG * f }
}

export const itemNutrition = (item: Pick<MealItem, 'grams' | 'kcal' | 'proteinG' | 'carbsG' | 'fatG'>) => nutritionFor(item, item.grams)

export function sumNutrition(list: readonly Nutrition[]): Nutrition {
  return list.reduce(
    (a, n) => ({ kcal: a.kcal + n.kcal, proteinG: a.proteinG + n.proteinG, carbsG: a.carbsG + n.carbsG, fatG: a.fatG + n.fatG }),
    ZERO_NUTRITION,
  )
}

/** kcal calculadas a partir de los macros (4/4/9). */
export const macroKcal = (n: Pick<Nutrition, 'proteinG' | 'carbsG' | 'fatG'>) => n.proteinG * 4 + n.carbsG * 4 + n.fatG * 9

/** Copia de los valores del alimento para guardar en un mealItem. */
export function mealItemSnapshot(food: Food): Pick<MealItem, 'foodId' | 'foodName' | 'kcal' | 'proteinG' | 'carbsG' | 'fatG'> {
  return { foodId: food.id, foodName: food.name, kcal: food.kcal, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG }
}

/** Opciones rápidas de cantidad: ración del producto (si hay) + valores comunes, sin repetir. */
export function quickGramOptions(servingG?: number): number[] {
  const base = [50, 100, 150, 200]
  return servingG && servingG > 0 ? [Math.round(servingG), ...base.filter((g) => g !== Math.round(servingG))] : base
}

// ─── Búsqueda local ────────────────────────────────────────────────────────

/** Busca por nombre y marca, sin tildes; todas las palabras deben aparecer. Favoritos primero. */
export function searchFoods<T extends Pick<Food, 'name' | 'brand' | 'isFavorite'>>(foods: readonly T[], query: string): T[] {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean)
  const q = normalizeText(query)
  return foods
    .filter((f) => {
      const hay = normalizeText(`${f.name} ${f.brand ?? ''}`)
      return tokens.every((t) => hay.includes(t))
    })
    .map((f) => ({ f, rank: (normalizeText(f.name).startsWith(q) ? 0 : 1) + (f.isFavorite ? 0 : 2) }))
    .sort((a, b) => a.rank - b.rank || a.f.name.localeCompare(b.f.name, 'es'))
    .map((x) => x.f)
}

// ─── Códigos de barras ─────────────────────────────────────────────────────

/** true si el dígito de control GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) es correcto. */
export function isValidGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

/** Limpia lo escrito (espacios, guiones) y valida; null si no es un código válido. */
export function normalizeBarcode(text: string): string | null {
  const code = text.replace(/[\s-]/g, '')
  return isValidGtin(code) ? code : null
}

// ─── Open Food Facts ───────────────────────────────────────────────────────

export interface FoodDraft {
  name: string
  brand?: string
  barcode?: string
  kcal?: number
  proteinG?: number
  carbsG?: number
  fatG?: number
  servingG?: number
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined
}

const round1 = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 10) / 10)

/**
 * Convierte la respuesta de la API v2 de Open Food Facts en un borrador de alimento.
 * Devuelve null si el producto no existe. Puede venir incompleto (faltan kcal o macros):
 * en ese caso se completa a mano en el formulario.
 */
export function parseOffProduct(json: unknown, barcode: string): FoodDraft | null {
  if (typeof json !== 'object' || json === null) return null
  const product = (json as { product?: unknown; status?: unknown }).product
  if (typeof product !== 'object' || product === null) return null
  const p = product as Record<string, unknown>
  const n = (typeof p.nutriments === 'object' && p.nutriments !== null ? p.nutriments : {}) as Record<string, unknown>

  const kj = num(n['energy-kj_100g']) ?? (n['energy_unit'] === 'kcal' ? undefined : num(n['energy_100g']))
  const kcal = num(n['energy-kcal_100g']) ?? (kj !== undefined ? kj / 4.184 : undefined)

  const name = [p.product_name_es, p.product_name, p.generic_name_es, p.generic_name]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .find(Boolean)
  const brand = typeof p.brands === 'string' ? p.brands.split(',')[0]?.trim() || undefined : undefined

  return {
    name: name ?? '',
    brand,
    barcode,
    kcal: kcal === undefined ? undefined : Math.round(kcal),
    proteinG: round1(num(n.proteins_100g)),
    carbsG: round1(num(n.carbohydrates_100g)),
    fatG: round1(num(n.fat_100g)),
    servingG: num(p.serving_quantity),
  }
}

/** true si el borrador trae todo lo necesario para guardarse sin pasar por el formulario. */
export const isCompleteDraft = (d: FoodDraft): boolean =>
  d.name.length > 0 && d.kcal !== undefined && d.proteinG !== undefined && d.carbsG !== undefined && d.fatG !== undefined

// ─── Formulario de alimento ────────────────────────────────────────────────

export interface FoodForm {
  name: string
  brand: string
  barcode: string
  kcal: string
  proteinG: string
  carbsG: string
  fatG: string
  servingG: string
}

export type FoodFormErrors = Partial<Record<keyof FoodForm, string>>

export type FoodValues = Pick<Food, 'name' | 'brand' | 'barcode' | 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'servingG'>

export function draftToForm(d: FoodDraft = { name: '' }): FoodForm {
  const s = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','))
  return {
    name: d.name,
    brand: d.brand ?? '',
    barcode: d.barcode ?? '',
    kcal: s(d.kcal),
    proteinG: s(d.proteinG),
    carbsG: s(d.carbsG),
    fatG: s(d.fatG),
    servingG: s(d.servingG),
  }
}

/** Valida el alta manual (valores por 100 g). `warning` si las kcal no cuadran con los macros. */
export function validateFoodForm(
  form: FoodForm,
): { ok: true; value: FoodValues; warning?: string } | { ok: false; errors: FoodFormErrors } {
  const errors: FoodFormErrors = {}
  const name = form.name.trim()
  if (!name) errors.name = 'Pon un nombre.'

  const field = (key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG', max: number) => {
    const v = parseDecimal(form[key])
    if (v === null || v < 0 || v > max) {
      errors[key] = `Entre 0 y ${max}.`
      return 0
    }
    return v
  }
  const kcal = field('kcal', 900)
  const proteinG = field('proteinG', 100)
  const carbsG = field('carbsG', 100)
  const fatG = field('fatG', 100)
  if (!errors.proteinG && !errors.carbsG && !errors.fatG && proteinG + carbsG + fatG > 100) {
    errors.fatG = 'Proteína + carbohidratos + grasa no puede superar 100 g.'
  }

  let servingG: number | undefined
  if (form.servingG.trim()) {
    const v = parseDecimal(form.servingG)
    if (v === null || v <= 0 || v > 2000) errors.servingG = 'Ración entre 1 y 2000 g.'
    else servingG = v
  }

  let barcode: string | undefined
  if (form.barcode.trim()) {
    barcode = normalizeBarcode(form.barcode) ?? undefined
    if (!barcode) errors.barcode = 'Código de barras no válido.'
  }

  if (Object.keys(errors).length) return { ok: false, errors }

  const value: FoodValues = { name, kcal, proteinG, carbsG, fatG }
  const brand = form.brand.trim()
  if (brand) value.brand = brand
  if (barcode) value.barcode = barcode
  if (servingG !== undefined) value.servingG = servingG

  const fromMacros = macroKcal(value)
  const warning =
    kcal > 0 && Math.abs(fromMacros - kcal) > Math.max(25, kcal * 0.2)
      ? `Las kcal (${Math.round(kcal)}) no cuadran con los macros (~${Math.round(fromMacros)} kcal). Revísalo.`
      : undefined
  return warning ? { ok: true, value, warning } : { ok: true, value }
}

/** Valida la cantidad en gramos. */
export function parseGrams(text: string): number | null {
  const g = parseDecimal(text)
  return g !== null && g > 0 && g <= 5000 ? g : null
}

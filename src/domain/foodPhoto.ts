/**
 * Borrador editable de una estimación por foto: cada alimento guarda sus valores por 100 g,
 * así que al cambiar los gramos kcal y macros se recalculan en proporción. Todo puro.
 */
import type { MealType } from './types'
import type { Confidence, FoodPhotoEstimate } from './foodPhotoSchema'
import { nutritionFor, parseGrams, sumNutrition, type FoodValues, type Nutrition } from './food'
import { parseDecimal } from './number'

export const CONFIDENCE_LABELS: Record<Confidence, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' }

export interface PhotoDraftItem {
  key: string
  name: string
  grams: number
  /** Valores por 100 g (calculados desde la estimación). */
  per100: Nutrition
  /** null = añadido a mano. */
  confidence: Confidence | null
  note: string
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Valores por 100 g a partir de los de una porción de `grams` gramos. */
export function per100From(n: Nutrition, grams: number): Nutrition {
  const f = grams > 0 ? 100 / grams : 0
  return { kcal: n.kcal * f, proteinG: n.proteinG * f, carbsG: n.carbsG * f, fatG: n.fatG * f }
}

export function draftFromEstimate(e: FoodPhotoEstimate): PhotoDraftItem[] {
  return e.items.map((it, i) => ({
    key: `ia${i}`,
    name: it.nombre.trim(),
    grams: Math.round(it.gramos),
    per100: per100From({ kcal: it.kcal, proteinG: it.proteina, carbsG: it.carbohidratos, fatG: it.grasa }, it.gramos),
    confidence: it.confianza,
    note: it.nota.trim(),
  }))
}

export const draftItemNutrition = (item: Pick<PhotoDraftItem, 'grams' | 'per100'>): Nutrition => nutritionFor(item.per100, item.grams)

export const draftTotals = (items: readonly PhotoDraftItem[]): Nutrition => sumNutrition(items.map(draftItemNutrition))

/** Cambia los gramos de un alimento (kcal y macros se recalculan solos). Ignora valores no válidos. */
export function setDraftGrams(items: readonly PhotoDraftItem[], key: string, grams: number): PhotoDraftItem[] {
  if (!(grams > 0 && grams <= 5000)) return [...items]
  return items.map((i) => (i.key === key ? { ...i, grams } : i))
}

export const removeDraftItem = (items: readonly PhotoDraftItem[], key: string): PhotoDraftItem[] => items.filter((i) => i.key !== key)

// ─── Añadir a mano ─────────────────────────────────────────────────────────

/** Alta manual: valores de la porción (no por 100 g), como los de la IA. */
export interface ManualItemForm {
  name: string
  grams: string
  kcal: string
  proteinG: string
  carbsG: string
  fatG: string
}

export const EMPTY_MANUAL_ITEM: ManualItemForm = { name: '', grams: '', kcal: '', proteinG: '', carbsG: '', fatG: '' }

export function validateManualItem(
  form: ManualItemForm,
): { ok: true; value: { name: string; grams: number; portion: Nutrition } } | { ok: false; errors: Partial<Record<keyof ManualItemForm, string>> } {
  const errors: Partial<Record<keyof ManualItemForm, string>> = {}
  const name = form.name.trim()
  if (!name) errors.name = 'Pon un nombre.'
  const grams = parseGrams(form.grams)
  if (grams === null) errors.grams = 'Gramos entre 1 y 5000.'
  const num = (key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG', max: number, optional: boolean) => {
    if (optional && !form[key].trim()) return 0
    const v = parseDecimal(form[key])
    if (v === null || v < 0 || v > max) {
      errors[key] = `Entre 0 y ${max}.`
      return 0
    }
    return v
  }
  const portion = { kcal: num('kcal', 5000, false), proteinG: num('proteinG', 500, true), carbsG: num('carbsG', 800, true), fatG: num('fatG', 400, true) }
  if (grams !== null && !errors.proteinG && !errors.carbsG && !errors.fatG && portion.proteinG + portion.carbsG + portion.fatG > grams) {
    errors.fatG = 'Los macros no pueden pesar más que el alimento.'
  }
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, value: { name, grams: grams!, portion } }
}

export function addDraftItem(items: readonly PhotoDraftItem[], v: { name: string; grams: number; portion: Nutrition }): PhotoDraftItem[] {
  const next = 1 + Math.max(-1, ...items.filter((i) => i.key.startsWith('m')).map((i) => Number(i.key.slice(1))))
  return [...items, { key: `m${next}`, name: v.name, grams: v.grams, per100: per100From(v.portion, v.grams), confidence: null, note: '' }]
}

// ─── Guardar ───────────────────────────────────────────────────────────────

/** Valores del alimento a guardar (por 100 g, redondeados) con la porción estimada como ración. */
export function foodValuesFromDraft(item: PhotoDraftItem): FoodValues {
  const p = item.per100
  return { name: item.name, kcal: Math.round(p.kcal), proteinG: round1(p.proteinG), carbsG: round1(p.carbsG), fatG: round1(p.fatG), servingG: Math.round(item.grams) }
}

/** Etiqueta del botón de guardar: "Guardar en el desayuno", "en la comida"… */
export const SAVE_TO_LABELS: Record<MealType, string> = {
  breakfast: 'Guardar en el desayuno',
  lunch: 'Guardar en la comida',
  dinner: 'Guardar en la cena',
  snack: 'Guardar en snacks',
}

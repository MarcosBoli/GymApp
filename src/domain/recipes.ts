/**
 * Recomendador de comidas en la app: búsqueda web construida por la app (nunca URLs del modelo),
 * borradores para "Me la he comido" y opciones ya vistas. Todo puro.
 */
import type { Recipe, Suggestion } from './mealSchema'
import { per100From, type FoodDraftItem } from './foodDraft'
import { normalizeText } from './workout'

export const DIFFICULTY_LABELS: Record<Suggestion['dificultad'], string> = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' }

/** Búsqueda de la receta en Google construida por la app. */
export const webSearchUrl = (name: string): string => `https://www.google.com/search?q=receta+${encodeURIComponent(name.trim())}`

/** Clave de caché de una receta (nombre normalizado). */
export const recipeKey = (name: string): string => normalizeText(name)

const nutritionOf = (m: { kcal: number; proteina: number; carbohidratos: number; grasa: number }) => ({ kcal: m.kcal, proteinG: m.proteina, carbsG: m.carbohidratos, fatG: m.grasa })

/** Borrador con los ingredientes de la receta en gramos (cada uno con sus valores por 100 g). */
export function draftFromRecipe(r: Recipe): FoodDraftItem[] {
  return r.ingredientes.map((ing, i) => ({
    key: `r${i}`,
    name: ing.nombre.trim(),
    grams: Math.round(ing.gramos),
    per100: per100From(nutritionOf(ing), ing.gramos),
    confidence: 'media',
    assumption: ing.medidaCasera?.trim() ? `≈ ${ing.medidaCasera.trim()} · receta: ${r.nombre}` : `receta: ${r.nombre}`,
  }))
}

/** Borrador con la estimación de la opción (sin receta): un plato con su ración aproximada. */
export function draftFromSuggestion(o: Suggestion): FoodDraftItem[] {
  return [
    {
      key: 'r0',
      name: o.nombre.trim(),
      grams: Math.round(o.gramosRacion),
      per100: per100From(nutritionOf(o), o.gramosRacion),
      confidence: 'baja',
      assumption: `ración estimada (~${Math.round(o.gramosRacion)} g); ajusta los gramos si tu plato era distinto`,
    },
  ]
}

/** Nombres ya vistos (para "Otras opciones"), sin repetir. */
export function seenNames(batches: readonly (readonly Suggestion[])[]): string[] {
  return [...new Set(batches.flat().map((o) => o.nombre.trim()))].slice(-60)
}

export const splitByKind = (opciones: readonly Suggestion[]) => ({
  simple: opciones.filter((o) => o.tipo === 'sencilla'),
  elaborate: opciones.filter((o) => o.tipo === 'elaborada'),
})

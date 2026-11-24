import { create } from 'zustand'
import type { AiFoodSource, DateKey, MealType } from '../domain/types'
import type { FoodDraft } from '../domain/food'
import type { FoodDraftItem } from '../domain/foodDraft'
import type { Suggestion } from '../domain/mealSchema'

/** Borrador ya calculado (p. ej. "Me la he comido" de una receta) que se abre directamente para revisar y guardar. */
export interface PrefilledDraft {
  items: FoodDraftItem[]
  comment: string
  source: AiFoodSource
}

export type FoodSheet =
  | { kind: 'add'; mealType: MealType }
  | { kind: 'scan'; mealType: MealType }
  /** Estimación con IA: empieza por la foto, la descripción (se pueden combinar) o un borrador ya hecho. */
  | { kind: 'estimate'; mealType: MealType; mode: 'photo' | 'text' | 'draft'; draft?: PrefilledDraft }
  /** "¿Qué como?": recomendaciones con IA. */
  | { kind: 'suggest'; mealType: MealType }
  /** Receta de una opción (de "Mis recetas"). */
  | { kind: 'recipe'; mealType: MealType; option: Suggestion }
  | { kind: 'quantity'; mealType: MealType; foodId: string; itemId?: string; grams?: number }
  | { kind: 'form'; mealType: MealType; draft?: FoodDraft; foodId?: string; notice?: string }

interface FoodUiState {
  /** Día mostrado en Comida; undefined = hoy. */
  date?: DateKey
  sheet: FoodSheet | null
  setDate: (date?: DateKey) => void
  open: (sheet: FoodSheet) => void
  close: () => void
}

export const useFoodUi = create<FoodUiState>()((set) => ({
  sheet: null,
  setDate: (date) => set({ date }),
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null }),
}))

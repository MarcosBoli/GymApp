import { create } from 'zustand'
import type { DateKey, MealType } from '../domain/types'
import type { FoodDraft } from '../domain/food'

export type FoodSheet =
  | { kind: 'add'; mealType: MealType }
  | { kind: 'scan'; mealType: MealType }
  | { kind: 'photo'; mealType: MealType }
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

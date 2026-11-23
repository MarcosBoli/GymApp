import { create } from 'zustand'
import type { BodyView } from '../data/bodyMap'

interface HomeUiState {
  view: BodyView
  selectedMuscleId?: string
  setView: (view: BodyView) => void
  select: (muscleId?: string) => void
}

export const useHomeUi = create<HomeUiState>()((set) => ({
  view: 'front',
  setView: (view) => set({ view }),
  select: (selectedMuscleId) => set({ selectedMuscleId }),
}))

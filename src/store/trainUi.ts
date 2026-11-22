import { create } from 'zustand'

interface TrainUiState {
  pickerOpen: boolean
  /** Ejercicio desplegado para registrar series (undefined = el primero sin terminar). */
  expandedExerciseId?: string
  openPicker: () => void
  closePicker: () => void
  expand: (exerciseId?: string) => void
}

export const useTrainUi = create<TrainUiState>()((set) => ({
  pickerOpen: false,
  openPicker: () => set({ pickerOpen: true }),
  closePicker: () => set({ pickerOpen: false }),
  expand: (expandedExerciseId) => set({ expandedExerciseId }),
}))

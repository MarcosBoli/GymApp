import { create } from 'zustand'

interface PlanUiState {
  /** Hoja "Generar rutina" abierta (en AppShell, accesible desde Inicio, Entrenar y el plan). */
  generatorOpen: boolean
  openGenerator: () => void
  closeGenerator: () => void
}

export const usePlanUi = create<PlanUiState>()((set) => ({
  generatorOpen: false,
  openGenerator: () => set({ generatorOpen: true }),
  closeGenerator: () => set({ generatorOpen: false }),
}))

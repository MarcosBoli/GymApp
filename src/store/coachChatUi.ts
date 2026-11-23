import { create } from 'zustand'

interface CoachChatUiState {
  /** Chat abierto: con un ejercicio concreto o general (desde el plan). null = cerrado. */
  chat: { exerciseId: string | null } | null
  openChat: (exerciseId: string | null) => void
  closeChat: () => void
}

export const useCoachChatUi = create<CoachChatUiState>()((set) => ({
  chat: null,
  openChat: (exerciseId) => set({ chat: { exerciseId } }),
  closeChat: () => set({ chat: null }),
}))

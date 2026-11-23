import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { adjustRestEnd } from '../domain/restTimer'

export const DEFAULT_REST_SECONDS = 90

interface RestTimerState {
  /** Instante en que termina el descanso. Solo timestamps: sobrevive a segundo plano y cierres. */
  endsAt?: number
  durationMs: number
  /** endsAt para el que ya ha sonado el aviso. */
  beepedFor?: number
  start: (now: number, seconds?: number) => void
  adjust: (now: number, deltaSeconds: number) => void
  stop: () => void
  markBeeped: (endsAt: number) => void
}

export const useRestTimer = create<RestTimerState>()(
  persist(
    (set, get) => ({
      durationMs: DEFAULT_REST_SECONDS * 1000,
      start: (now, seconds = DEFAULT_REST_SECONDS) => set({ endsAt: now + seconds * 1000, durationMs: seconds * 1000 }),
      adjust: (now, delta) => {
        const { endsAt, durationMs } = get()
        if (endsAt === undefined) return
        const next = adjustRestEnd(endsAt, now, delta)
        set({ endsAt: next, durationMs: Math.max(1000, durationMs + (next - Math.max(endsAt, now))) })
      },
      stop: () => set({ endsAt: undefined }),
      markBeeped: (endsAt) => set({ beepedFor: endsAt }),
    }),
    { name: 'gymapp-rest-timer' },
  ),
)

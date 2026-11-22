import type { Timestamp } from './types'

/** Tiempo que se sigue mostrando "Descanso terminado" tras acabar. */
export const REST_DONE_VISIBLE_MS = 30_000
/** Si al volver a primer plano el descanso acabó hace más de esto, ya no suena. */
export const REST_BEEP_GRACE_MS = 3_000

export type RestPhase = 'idle' | 'running' | 'done'

/** Todo se calcula con timestamps: funciona aunque la app haya estado en segundo plano. */
export function restRemainingMs(endsAt: Timestamp, now: Timestamp): number {
  return Math.max(0, endsAt - now)
}

export function restPhase(endsAt: Timestamp | undefined, now: Timestamp): RestPhase {
  if (endsAt === undefined) return 'idle'
  if (now < endsAt) return 'running'
  return now - endsAt <= REST_DONE_VISIBLE_MS ? 'done' : 'idle'
}

export function shouldBeep(endsAt: Timestamp | undefined, now: Timestamp, beepedFor: Timestamp | undefined): boolean {
  return endsAt !== undefined && now >= endsAt && now - endsAt <= REST_BEEP_GRACE_MS && beepedFor !== endsAt
}

/** Suma/resta segundos al descanso en curso; nunca termina antes de `now`. */
export function adjustRestEnd(endsAt: Timestamp, now: Timestamp, deltaSeconds: number): Timestamp {
  return Math.max(now, Math.max(endsAt, now) + deltaSeconds * 1000)
}

/** Progreso 0..1 del descanso (1 = terminado). */
export function restProgress(endsAt: Timestamp, durationMs: number, now: Timestamp): number {
  if (durationMs <= 0) return 1
  return Math.min(1, Math.max(0, 1 - (endsAt - now) / durationMs))
}

/**
 * "m:ss" o "h:mm:ss". Para cuentas atrás se redondea hacia arriba (no muestra 0:00
 * mientras queda tiempo); para tiempo transcurrido, hacia abajo.
 */
export function formatClock(ms: number, rounding: 'ceil' | 'floor' = 'floor'): string {
  const total = Math.max(0, rounding === 'ceil' ? Math.ceil(ms / 1000) : Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

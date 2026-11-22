import type { DateKey } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Día local 'YYYY-MM-DD' de una fecha. */
export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Días naturales (locales) transcurridos de `from` a `to`. */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  // round absorbe los días de 23/25 h por cambio de horario
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

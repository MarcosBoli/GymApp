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

/** Date local (00:00) a partir de un DateKey. */
export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

/** Suma (o resta) días naturales a un DateKey. */
export function addDays(key: DateKey, days: number): DateKey {
  const date = fromDateKey(key)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

/** Días naturales entre dos DateKey (b − a). */
export function daysBetweenKeys(a: DateKey, b: DateKey): number {
  return calendarDaysBetween(fromDateKey(a), fromDateKey(b))
}

/** Lista de DateKey de `from` a `to`, ambos incluidos. */
export function dateRange(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** Lunes de la semana de la fecha (semana europea, lunes–domingo). */
export function startOfWeek(key: DateKey): DateKey {
  const day = fromDateKey(key).getDay() // 0 = domingo
  return addDays(key, -((day + 6) % 7))
}

import { describe, expect, it } from 'vitest'
import { calendarDaysBetween, toDateKey } from './dates'

describe('toDateKey', () => {
  it('formatea el día local con ceros', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(toDateKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })
})

describe('calendarDaysBetween', () => {
  it('cuenta días naturales, no bloques de 24 h', () => {
    expect(calendarDaysBetween(new Date(2026, 10, 21, 23, 50), new Date(2026, 10, 22, 0, 10))).toBe(1)
    expect(calendarDaysBetween(new Date(2026, 10, 22, 1), new Date(2026, 10, 22, 23))).toBe(0)
  })

  it('cruza cambios de horario y meses', () => {
    expect(calendarDaysBetween(new Date(2026, 2, 28), new Date(2026, 3, 2))).toBe(5)
    expect(calendarDaysBetween(new Date(2026, 9, 24), new Date(2026, 9, 26))).toBe(2)
  })
})

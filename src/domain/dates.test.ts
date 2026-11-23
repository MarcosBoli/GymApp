import { describe, expect, it } from 'vitest'
import { addDays, calendarDaysBetween, dateRange, daysBetweenKeys, fromDateKey, toDateKey } from './dates'

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

describe('addDays / daysBetweenKeys / dateRange / fromDateKey', () => {
  it('suma días cruzando meses, años y cambios de hora', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
  })

  it('cuenta días entre claves', () => {
    expect(daysBetweenKeys('2026-11-01', '2026-11-15')).toBe(14)
    expect(daysBetweenKeys('2026-11-15', '2026-11-01')).toBe(-14)
  })

  it('genera rangos inclusivos', () => {
    expect(dateRange('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
    expect(dateRange('2026-01-02', '2026-01-01')).toEqual([])
  })

  it('fromDateKey devuelve medianoche local', () => {
    const d = fromDateKey('2026-11-22')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 22, 0])
  })
})

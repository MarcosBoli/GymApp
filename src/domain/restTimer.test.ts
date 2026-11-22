import { describe, expect, it } from 'vitest'
import { adjustRestEnd, formatClock, restPhase, restProgress, restRemainingMs, shouldBeep } from './restTimer'

const T = 1_000_000

describe('restRemainingMs', () => {
  it('calcula con timestamps y nunca es negativo', () => {
    expect(restRemainingMs(T + 90_000, T)).toBe(90_000)
    expect(restRemainingMs(T, T + 5_000)).toBe(0)
  })

  it('sigue siendo correcto tras "volver de segundo plano" (salto grande de reloj)', () => {
    const endsAt = T + 90_000
    expect(restRemainingMs(endsAt, T + 60_000)).toBe(30_000)
    expect(restRemainingMs(endsAt, T + 10 * 60_000)).toBe(0)
  })
})

describe('restPhase', () => {
  it.each([
    [undefined, T, 'idle'],
    [T + 1, T, 'running'],
    [T, T, 'done'],
    [T, T + 30_000, 'done'],
    [T, T + 30_001, 'idle'],
  ] as const)('endsAt %s, now %d → %s', (endsAt, now, phase) => {
    expect(restPhase(endsAt, now)).toBe(phase)
  })
})

describe('shouldBeep', () => {
  it('suena justo al terminar, una sola vez', () => {
    expect(shouldBeep(T, T - 1, undefined)).toBe(false)
    expect(shouldBeep(T, T, undefined)).toBe(true)
    expect(shouldBeep(T, T + 3_000, undefined)).toBe(true)
    expect(shouldBeep(T, T + 500, T)).toBe(false)
  })

  it('no suena si terminó hace rato (app en segundo plano)', () => {
    expect(shouldBeep(T, T + 3_001, undefined)).toBe(false)
  })

  it('un descanso nuevo vuelve a sonar', () => {
    expect(shouldBeep(T + 90_000, T + 90_000, T)).toBe(true)
  })

  it('sin descanso no suena', () => {
    expect(shouldBeep(undefined, T, undefined)).toBe(false)
  })
})

describe('adjustRestEnd', () => {
  it('suma y resta segundos', () => {
    expect(adjustRestEnd(T + 60_000, T, 15)).toBe(T + 75_000)
    expect(adjustRestEnd(T + 60_000, T, -15)).toBe(T + 45_000)
  })

  it('no termina antes de ahora', () => {
    expect(adjustRestEnd(T + 10_000, T, -15)).toBe(T)
  })

  it('si ya había terminado, suma desde ahora', () => {
    expect(adjustRestEnd(T - 5_000, T, 15)).toBe(T + 15_000)
  })
})

describe('restProgress', () => {
  it('va de 0 a 1', () => {
    expect(restProgress(T + 90_000, 90_000, T)).toBe(0)
    expect(restProgress(T + 45_000, 90_000, T)).toBeCloseTo(0.5)
    expect(restProgress(T, 90_000, T)).toBe(1)
    expect(restProgress(T, 90_000, T + 1000)).toBe(1)
    expect(restProgress(T + 200_000, 90_000, T)).toBe(0)
    expect(restProgress(T, 0, T)).toBe(1)
  })
})

describe('formatClock', () => {
  it.each([
    [0, 'floor', '0:00'],
    [59_999, 'floor', '0:59'],
    [59_001, 'ceil', '1:00'],
    [90_000, 'ceil', '1:30'],
    [1, 'ceil', '0:01'],
    [3_600_000, 'floor', '1:00:00'],
    [3_725_000, 'floor', '1:02:05'],
    [-500, 'floor', '0:00'],
  ] as const)('%d ms (%s) → %s', (ms, r, s) => {
    expect(formatClock(ms, r)).toBe(s)
  })
})

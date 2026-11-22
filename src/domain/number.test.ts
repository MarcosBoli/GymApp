import { describe, expect, it } from 'vitest'
import { formatDecimal, parseDecimal, stepDecimal } from './number'

describe('parseDecimal', () => {
  it.each([
    ['72,5', 72.5],
    ['72.5', 72.5],
    [' 100 ', 100],
    ['0', 0],
    [',5', 0.5],
    ['80,', 80],
    ['-2,5', -2.5],
  ])('"%s" → %d', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '1,2,3', '1.2.3', '12kg', '.', ','])('"%s" → null', (input) => {
    expect(parseDecimal(input)).toBeNull()
  })
})

describe('formatDecimal', () => {
  it.each([
    [72.5, '72,5'],
    [100, '100'],
    [1000, '1000'],
    [2.345, '2,35'],
    [0, '0'],
    [-10, '-10'],
  ])('%f → %s', (n, s) => {
    expect(formatDecimal(n)).toBe(s)
  })
})

describe('stepDecimal', () => {
  it.each([
    ['80', 2.5, 0, '82,5'],
    ['82,5', -2.5, 0, '80'],
    ['', 2.5, 0, '2,5'],
    ['abc', 1, 0, '1'],
    ['1', -2.5, 0, '0'],
    ['0', -5, -100, '-5'],
    ['0,1', 0.2, 0, '0,3'],
  ])('"%s" %+f (min %d) → %s', (t, d, min, out) => {
    expect(stepDecimal(t, d, min)).toBe(out)
  })
})

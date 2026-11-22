import { describe, expect, it } from 'vitest'
import { parseDecimal } from './number'

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

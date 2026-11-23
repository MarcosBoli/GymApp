import { describe, expect, it } from 'vitest'
import { fitWithin, stripDataUrl } from './imageSize'

describe('fitWithin', () => {
  it.each([
    [4032, 3024, { width: 1024, height: 768 }], // horizontal de iPhone
    [3024, 4032, { width: 768, height: 1024 }], // vertical
    [800, 600, { width: 800, height: 600 }], // ya cabe: no amplía
    [5000, 10, { width: 1024, height: 2 }],
    [10000, 1, { width: 1024, height: 1 }], // nunca 0
    [0, 100, { width: 0, height: 0 }],
  ])('%d×%d → %o', (w, h, out) => {
    expect(fitWithin(w, h, 1024)).toEqual(out)
  })
})

it('stripDataUrl', () => {
  expect(stripDataUrl('data:image/jpeg;base64,/9j/AAA')).toBe('/9j/AAA')
})

import { describe, expect, it } from 'vitest'
import { activeTabIndex, indicatorStretch } from './navigation'

const TABS = ['/', '/entrenar', '/comida', '/progreso', '/perfil']

describe('activeTabIndex', () => {
  it.each([
    ['/', 0],
    ['/entrenar', 1],
    ['/entrenar/', 1],
    ['/entrenar/plan', 1],
    ['/entrenar/resumen/abc', 1],
    ['/comida', 2],
    ['/progreso', 3],
    ['/perfil', 4],
    ['/entrenarx', -1], // no es un prefijo de segmento
    ['/otra', -1],
  ])('%s → %d', (pathname, index) => {
    expect(activeTabIndex(TABS, pathname)).toBe(index)
  })
})

describe('indicatorStretch', () => {
  it('1 en reposo, crece con la velocidad en ambos sentidos, con tope', () => {
    expect(indicatorStretch(0)).toBe(1)
    expect(indicatorStretch(5)).toBeCloseTo(1.3)
    expect(indicatorStretch(-5)).toBeCloseTo(1.3)
    expect(indicatorStretch(100)).toBeCloseTo(1.6)
  })
})

import { describe, expect, it } from 'vitest'
import { EMBLEM_SPECS, divisionPips, emblemComplexity, emblemGeometry, emblemSpec, regularPolygon, star } from './emblem'
import { RANK_CONFIG } from '../data/ranking'

const coords = (points: string) => points.split(' ').map((p) => p.split(',').map(Number) as [number, number])

describe('emblemas', () => {
  it('una especificación por tier', () => {
    expect(EMBLEM_SPECS).toHaveLength(RANK_CONFIG.tiers.length)
  })

  it('la complejidad crece estrictamente con cada tier', () => {
    const c = EMBLEM_SPECS.map(emblemComplexity)
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThan(c[i - 1]!)
  })

  it('todas las especificaciones son distintas', () => {
    expect(new Set(EMBLEM_SPECS.map((s) => JSON.stringify(s))).size).toBe(EMBLEM_SPECS.length)
  })

  it('emblemSpec limita el índice', () => {
    expect(emblemSpec(-3)).toBe(EMBLEM_SPECS[0])
    expect(emblemSpec(99)).toBe(EMBLEM_SPECS.at(-1))
  })

  it.each(EMBLEM_SPECS.map((s, i) => [i, s] as const))('tier %d: toda la geometría cabe en el viewBox', (_, s) => {
    const g = emblemGeometry(s)
    const all = [g.plate, g.inner, g.star, g.crown, ...g.rays].filter(Boolean).flatMap((p) => coords(p!))
    all.push(...g.orbit, ...g.facets.flat())
    for (const [x, y] of all) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(100)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(100)
    }
    expect(coords(g.plate)).toHaveLength(s.plateSides)
    expect(g.rays).toHaveLength(s.rays)
    expect(g.orbit).toHaveLength(s.orbitDots)
  })

  it('polígonos y estrellas regulares, con el primer vértice arriba', () => {
    const sq = coords(regularPolygon(4, 10))
    expect(sq[0]![0]).toBeCloseTo(50)
    expect(sq[0]![1]).toBeCloseTo(40)
    const st = coords(star(5, 10, 4))
    expect(st).toHaveLength(10)
    expect(Math.hypot(st[1]![0] - 50, st[1]![1] - 50)).toBeCloseTo(4)
  })

  it('barras de división', () => {
    expect([divisionPips('IV'), divisionPips('III'), divisionPips('II'), divisionPips('I'), divisionPips(null)]).toEqual([1, 2, 3, 4, 0])
  })
})

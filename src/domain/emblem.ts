/**
 * Geometría de los emblemas de tier: diseño propio y procedural. Cada tier añade
 * capas y vértices (polígono base → facetas → polígono interior → estrella → rayos
 * → órbita → corona). viewBox 0 0 100 100, centro (50, 50).
 */

export interface EmblemSpec {
  plateSides: number
  facets: boolean
  innerSides: number
  starPoints: number
  rays: number
  orbitDots: number
  crown: boolean
}

const S = (plateSides: number, facets: boolean, innerSides: number, starPoints: number, rays: number, orbitDots: number, crown: boolean): EmblemSpec => ({
  plateSides, facets, innerSides, starPoints, rays, orbitDots, crown,
})

/** Una especificación por tier (Hierro → Leyenda). */
export const EMBLEM_SPECS: readonly EmblemSpec[] = [
  S(4, false, 0, 0, 0, 0, false), // Hierro: rombo liso
  S(5, true, 0, 0, 0, 0, false), // Bronce: pentágono facetado
  S(6, true, 6, 0, 0, 0, false), // Plata: hexágono doble
  S(6, true, 6, 6, 0, 0, false), // Oro: + estrella
  S(8, true, 8, 8, 0, 0, false), // Platino: octógono
  S(8, true, 8, 8, 8, 0, false), // Esmeralda: + rayos
  S(10, true, 10, 5, 10, 0, false), // Diamante: decágono
  S(12, true, 12, 6, 12, 12, false), // Maestro: + órbita
  S(12, true, 12, 12, 24, 12, true), // Leyenda: + corona
]

export function emblemSpec(tierIndex: number): EmblemSpec {
  return EMBLEM_SPECS[Math.max(0, Math.min(EMBLEM_SPECS.length - 1, tierIndex))]!
}

/** Medida de complejidad: vértices dibujados. Crece estrictamente con el tier. */
export function emblemComplexity(s: EmblemSpec): number {
  return s.plateSides + (s.facets ? s.plateSides : 0) + s.innerSides + s.starPoints * 2 + s.rays * 3 + s.orbitDots + (s.crown ? 24 : 0)
}

type Pt = [number, number]
const C = 50
const fmt = (pts: Pt[]) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
const polar = (r: number, angle: number): Pt => [C + r * Math.cos(angle), C + r * Math.sin(angle)]
/** Ángulo del vértice i de n, con el primero arriba. */
const ang = (i: number, n: number, offset = 0) => -Math.PI / 2 + ((i + offset) * 2 * Math.PI) / n

export const regularPolygon = (n: number, r: number, offset = 0): string => fmt(Array.from({ length: n }, (_, i) => polar(r, ang(i, n, offset))))

export const star = (points: number, rOuter: number, rInner: number, offset = 0): string =>
  fmt(Array.from({ length: points * 2 }, (_, i) => polar(i % 2 === 0 ? rOuter : rInner, ang(i, points * 2, offset * 2))))

export interface EmblemGeometry {
  plate: string
  facets: [Pt, Pt][]
  inner?: string
  star?: string
  rays: string[]
  orbit: Pt[]
  crown?: string
}

export const EMBLEM_RADII = { plate: 30, inner: 19, starOuter: 14, starInner: 6, rayFrom: 32, rayTo: 41, orbit: 45.5, crownOuter: 49, crownInner: 43.5 } as const

export function emblemGeometry(s: EmblemSpec): EmblemGeometry {
  const R = EMBLEM_RADII
  const rays = Array.from({ length: s.rays }, (_, i) => {
    const a = ang(i, s.rays, 0.5)
    const half = Math.PI / s.rays / 2.2
    return fmt([polar(R.rayFrom, a - half), polar(R.rayTo, a), polar(R.rayFrom, a + half)])
  })
  return {
    plate: regularPolygon(s.plateSides, R.plate),
    facets: s.facets ? Array.from({ length: s.plateSides }, (_, i) => [polar(R.inner * 0.55, ang(i, s.plateSides)), polar(R.plate, ang(i, s.plateSides))] as [Pt, Pt]) : [],
    inner: s.innerSides ? regularPolygon(s.innerSides, R.inner, 0.5) : undefined,
    star: s.starPoints ? star(s.starPoints, R.starOuter, R.starInner) : undefined,
    rays,
    orbit: Array.from({ length: s.orbitDots }, (_, i) => polar(R.orbit, ang(i, s.orbitDots, 0.5))),
    crown: s.crown ? star(12, R.crownOuter, R.crownInner) : undefined,
  }
}

/** Barras de división: IV = 1 … I = 4. */
export const divisionPips = (division: 'IV' | 'III' | 'II' | 'I' | null): number => (division ? ({ IV: 1, III: 2, II: 3, I: 4 } as const)[division] : 0)

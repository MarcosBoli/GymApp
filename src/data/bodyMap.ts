/**
 * Mapa corporal delantero/trasero. Los trazos salen de assets-src/body/front.svg y back.svg
 * (dibujados a mano y vectorizados en Inkscape) y se convierten a src/data/bodyMapPaths.ts con:
 *   node scripts/generate-body-map.mjs
 * Cada músculo se pinta con el color de su rango en BodyMap.tsx.
 */
export type BodyView = 'front' | 'back'

export { BODY_PATHS, type BodyViewPaths } from './bodyMapPaths'

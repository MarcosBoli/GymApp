// Genera src/data/bodyMapPaths.ts a partir de assets-src/body/front.svg y back.svg.
// Cada <path> del SVG es un color plano; el color decide a qué músculo pertenece.
// Uso: node scripts/generate-body-map.mjs
import { readFileSync, writeFileSync } from 'node:fs'

// Color de referencia → id de músculo (null = silueta sin rango: cabeza, manos, articulaciones…)
const PALETTE = {
  front: [
    ['#962aa4', 'traps'],
    ['#e73935', 'front_delts'],
    ['#f88406', 'side_delts'],
    ['#2487d9', 'chest'],
    ['#4a9d51', 'biceps'],
    ['#6a4c43', 'forearms'],
    ['#fcd334', 'abs'],
    ['#0ba7bd', 'quads'],
    ['#d71b69', 'calves'],
    ['#9e9e9e', null],
  ],
  back: [
    ['#8f22a0', 'traps'],
    ['#da8d14', 'side_delts'],
    ['#ec4c15', 'rear_delts'],
    ['#39489f', 'triceps'],
    ['#614b42', 'forearms'],
    ['#0f8581', 'lats'],
    ['#33936a', 'lower_back'],
    ['#d80000', 'glutes'],
    ['#57319b', 'hamstrings'],
    ['#d51667', 'calves'],
    ['#9e9e9e', null],
  ],
}
const MAX_DIST = 40

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]))

function parse(view) {
  const src = readFileSync(`assets-src/body/${view}.svg`, 'utf8')
  const viewBox = /<svg[^>]*\sviewBox="([^"]+)"/s.exec(src)?.[1]
  if (!viewBox) throw new Error(`${view}: sin viewBox`)
  if (/\stransform=/.test(src)) throw new Error(`${view}: el SVG tiene transform; aplícalos en Inkscape (Objeto > Transformar) antes de generar`)
  const parts = new Map()
  for (const [, attrs] of src.matchAll(/<path\b([^>]*?)\/?>/gs)) {
    const d = /\sd="([^"]+)"/s.exec(attrs)?.[1]
    const color = (/fill:\s*(#[0-9a-fA-F]{6})/.exec(attrs) ?? /\sfill="(#[0-9a-fA-F]{6})"/.exec(attrs))?.[1]?.toLowerCase()
    if (!d || !color) throw new Error(`${view}: path sin d o sin color de relleno`)
    let best = null
    for (const [ref, id] of PALETTE[view]) {
      const dd = dist(hex(color), hex(ref))
      if (!best || dd < best.dd) best = { dd, id }
    }
    if (best.dd > MAX_DIST) throw new Error(`${view}: color ${color} no se parece a ningún músculo; añádelo a PALETTE`)
    const key = best.id ?? '__base'
    parts.set(key, [...(parts.get(key) ?? []), d.replace(/\s+/g, ' ').trim()])
  }
  const missing = PALETTE[view].filter(([, id]) => id && !parts.has(id)).map(([, id]) => id)
  if (missing.length) throw new Error(`${view}: faltan músculos: ${missing.join(', ')}`)
  return { viewBox, base: parts.get('__base') ?? [], muscles: [...parts].filter(([k]) => k !== '__base').map(([muscleId, d]) => ({ muscleId, d })) }
}

const front = parse('front')
const back = parse('back')
const out = `// ARCHIVO GENERADO por scripts/generate-body-map.mjs desde assets-src/body/*.svg. No editar a mano.
import type { MuscleId } from './muscles'

export interface BodyViewPaths {
  viewBox: string
  /** Silueta sin rango (cabeza, cuello, manos, articulaciones, pies). */
  base: string[]
  /** Cada músculo puede tener varios trazos (lado izquierdo y derecho, etc.). */
  muscles: { muscleId: MuscleId; d: string[] }[]
}

export const BODY_PATHS: { front: BodyViewPaths; back: BodyViewPaths } = ${JSON.stringify({ front, back })}
`
writeFileSync('src/data/bodyMapPaths.ts', out)
for (const [v, p] of [['front', front], ['back', back]]) console.log(v, p.viewBox, 'base:', p.base.length, 'músculos:', p.muscles.map((m) => `${m.muscleId}(${m.d.length})`).join(' '))

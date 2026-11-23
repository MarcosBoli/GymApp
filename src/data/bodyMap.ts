import type { MuscleId } from './muscles'

/**
 * Silueta propia, geométrica. viewBox 0 0 200 380; eje de simetría x = 100.
 * Cada forma describe la mitad izquierda (la que ve el usuario a la izquierda) y se
 * refleja para la derecha. `center: true` = forma única sobre el eje (no se refleja).
 */
export type BodyView = 'front' | 'back'

export interface BodyShape {
  points: string
  center?: boolean
}

/** Silueta base (zonas que no son músculos con rango: cabeza, manos, rodillas, pies…). */
export const BODY_BASE: BodyShape[] = [
  { points: '100,8 112,12 117,24 115,38 108,46 100,48', center: false }, // cabeza (mitad)
  { points: '92,44 108,44 108,56 92,56', center: true }, // cuello
  { points: '92,50 74,56 62,62 58,76 58,112 62,122 70,122 72,100 76,130 74,162 76,178 100,184 100,50' }, // tronco + brazo
  { points: '56,118 70,120 70,134 64,164 58,172 50,168 50,140' }, // antebrazo
  { points: '50,168 58,172 58,188 52,194 46,188 46,174' }, // mano
  { points: '74,176 100,184 99,198 96,252 94,272 92,304 90,340 94,356 72,356 76,338 72,302 72,270 70,232 70,200' }, // pierna
]

/** Músculos por vista (mitad izquierda; se reflejan). */
export const BODY_MUSCLES: Record<BodyView, { muscleId: MuscleId; shapes: BodyShape[] }[]> = {
  front: [
    { muscleId: 'traps', shapes: [{ points: '93,52 80,57 93,59' }] },
    { muscleId: 'side_delts', shapes: [{ points: '74,58 64,62 59,72 60,84 66,84 69,70' }] },
    { muscleId: 'front_delts', shapes: [{ points: '79,59 71,61 68,72 68,84 74,80 80,70' }] },
    { muscleId: 'chest', shapes: [{ points: '82,61 98.5,63 98.5,96 88,99 78,93 74,84 80,72' }] },
    { muscleId: 'biceps', shapes: [{ points: '61,88 68,87 71,98 69,114 63,119 59,110 59,97' }] },
    { muscleId: 'forearms', shapes: [{ points: '58,122 68,122 69,134 64,160 57,168 52,164 53,140' }] },
    { muscleId: 'abs', shapes: [{ points: '86,102 98.5,102 98.5,160 90,162 86,150 84,124' }] },
    { muscleId: 'quads', shapes: [{ points: '77,182 92,186 97,200 95,250 87,262 77,256 73,230 73,202' }] },
    { muscleId: 'calves', shapes: [{ points: '76,280 85,276 89,292 88,326 82,336 76,328 74,302' }] },
  ],
  back: [
    { muscleId: 'traps', shapes: [{ points: '98.5,48 92,50 78,58 88,72 98.5,94' }] },
    { muscleId: 'side_delts', shapes: [{ points: '73,58 64,62 59,72 60,84 66,84 68,70' }] },
    { muscleId: 'rear_delts', shapes: [{ points: '77,60 70,62 68,72 69,84 76,78 81,68' }] },
    { muscleId: 'lats', shapes: [{ points: '82,74 90,80 98.5,98 98.5,122 88,140 78,128 74,100 76,84' }] },
    { muscleId: 'lower_back', shapes: [{ points: '88,144 98.5,126 98.5,168 87,170' }] },
    { muscleId: 'triceps', shapes: [{ points: '60,88 68,86 71,98 69,114 63,119 59,110 59,97' }] },
    { muscleId: 'forearms', shapes: [{ points: '58,122 68,122 69,134 64,160 57,168 52,164 53,140' }] },
    { muscleId: 'glutes', shapes: [{ points: '78,174 98.5,176 98.5,208 90,214 80,208 75,190' }] },
    { muscleId: 'hamstrings', shapes: [{ points: '77,216 91,218 96,230 94,258 86,266 78,260 73,238' }] },
    { muscleId: 'calves', shapes: [{ points: '76,278 87,274 91,292 88,322 81,332 74,318 73,294' }] },
  ],
}

/** Refleja una lista de puntos sobre el eje x = 100. */
export function mirrorPoints(points: string): string {
  return points
    .split(' ')
    .map((p) => {
      const [x, y] = p.split(',').map(Number) as [number, number]
      return `${200 - x},${y}`
    })
    .join(' ')
}

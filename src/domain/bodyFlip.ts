/**
 * Giro delante/detrás del mapa corporal como una carta de dos caras ligada al dedo
 * (guías de "Designing Fluid Interfaces" de Apple). Todo puro: ángulos en grados,
 * 0 = delante, 180 = detrás; el ángulo se acumula (360, 540…) para girar varias veces.
 */
import type { BodyView } from '../data/bodyMap'

/** Desplazamiento mínimo (px) para que un toque pase a ser arrastre. */
export const TAP_SLOP_PX = 6
/** Ritmo de deceleración de un scroll normal de iOS (UIScrollView.DecelerationRate.normal). */
export const DECELERATION_RATE = 0.998
/** Ventana para medir la velocidad al soltar. */
export const VELOCITY_WINDOW_MS = 100

/** Ángulo durante el arrastre: un ancho completo de contenedor = media vuelta (180°). */
export function angleFromDrag(baseAngle: number, dx: number, width: number): number {
  return width > 0 ? baseAngle + (dx * 180) / width : baseAngle
}

/** Velocidad del dedo (px/s) → velocidad angular (°/s) con la misma escala que el arrastre. */
export const degreesPerSecond = (pxPerSecond: number, width: number): number => (width > 0 ? (pxPerSecond * 180) / width : 0)

/**
 * Distancia que recorrería algo lanzado a `velocity` (unidades/s) frenando como un scroll de iOS:
 * (v / 1000) × r / (1 − r). Fórmula de proyección de la charla de Apple.
 */
export function projectDistance(velocity: number, rate: number = DECELERATION_RATE): number {
  return ((velocity / 1000) * rate) / (1 - rate)
}

/** Ángulo donde acabaría el giro si siguiera por inercia. */
export const projectAngle = (angle: number, velocityDeg: number): number => angle + projectDistance(velocityDeg)

/** Cara más cercana (múltiplo de 180°) a un ángulo. */
export const nearestFace = (angle: number): number => 180 * Math.round(angle / 180)

/**
 * Destino al soltar: si la proyección pasa de 90° respecto a la cara de partida, completa
 * media vuelta en el sentido del gesto; si no, vuelve. Como mucho un giro por gesto.
 */
export function flipTarget(startFace: number, projected: number): number {
  const delta = projected - startFace
  return Math.abs(delta) > 90 ? startFace + Math.sign(delta) * 180 : startFace
}

/** Vista que se ve con un ángulo (normalizado: 0 delante, 180 detrás, 360 delante…). */
export function viewForAngle(angle: number): BodyView {
  const half = ((Math.round(angle / 180) % 2) + 2) % 2
  return half === 0 ? 'front' : 'back'
}

/** Ángulo de destino para mostrar `view` desde el ángulo actual (botones Delante/Detrás): la cara más cercana. */
export function angleForView(current: number, view: BodyView): number {
  const face = nearestFace(current)
  if (viewForAngle(face) === view) return face
  // La otra cara: hacia el lado en que ya está inclinada la carta (o hacia delante si está recta)
  return current < face ? face - 180 : face + 180
}

/** ¿Se ha movido lo bastante para ser arrastre y no toque? */
export const exceedsSlop = (dx: number, dy: number, slop: number = TAP_SLOP_PX): boolean => Math.hypot(dx, dy) >= slop

export interface PointerSample {
  /** ms */
  t: number
  x: number
}

/** Velocidad horizontal (px/s) de las muestras de los últimos `windowMs` antes de `now`; 0 si no hay datos. */
export function releaseVelocity(samples: readonly PointerSample[], now: number, windowMs: number = VELOCITY_WINDOW_MS): number {
  const recent = samples.filter((s) => now - s.t <= windowMs)
  if (recent.length < 2) return 0
  const first = recent[0]!
  const last = recent.at(-1)!
  const dt = last.t - first.t
  return dt > 0 ? ((last.x - first.x) / dt) * 1000 : 0
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** Oscuridad sobre el cuerpo: máxima (0,5) de perfil, nula de frente o de espaldas. */
export const shadeOpacity = (angle: number): number => Math.abs(Math.sin(rad(angle))) * 0.5

/** Anchura relativa de la sombra bajo los pies: estrecha de perfil (0,6), entera de frente (1). */
export const shadowScaleX = (angle: number): number => 0.6 + 0.4 * Math.abs(Math.cos(rad(angle)))

import { describe, expect, it } from 'vitest'
import {
  angleForView,
  angleFromDrag,
  degreesPerSecond,
  exceedsSlop,
  flipTarget,
  nearestFace,
  projectAngle,
  projectDistance,
  releaseVelocity,
  shadeOpacity,
  shadowScaleX,
  viewForAngle,
} from './bodyFlip'

describe('arrastre', () => {
  it('un ancho de contenedor = 180°, en el sentido del dedo, desde el ángulo base', () => {
    expect(angleFromDrag(0, 224, 224)).toBe(180)
    expect(angleFromDrag(0, 112, 224)).toBe(90)
    expect(angleFromDrag(180, -56, 224)).toBe(135)
    expect(angleFromDrag(37, 10, 0)).toBe(37) // sin ancho no se mueve
  })

  it('velocidad px/s → °/s con la misma escala', () => {
    expect(degreesPerSecond(224, 224)).toBe(180)
    expect(degreesPerSecond(-448, 224)).toBe(-360)
    expect(degreesPerSecond(100, 0)).toBe(0)
  })

  it('toque frente a arrastre con umbral de 6 px', () => {
    expect(exceedsSlop(3, 4)).toBe(false) // 5 px
    expect(exceedsSlop(6, 0)).toBe(true)
    expect(exceedsSlop(-4, -5)).toBe(true) // 6,4 px
  })
})

describe('proyección (fórmula de Apple)', () => {
  it('v/1000 × 0,998 / (1 − 0,998)', () => {
    expect(projectDistance(1000)).toBeCloseTo(499)
    expect(projectDistance(-200)).toBeCloseTo(-99.8)
    expect(projectDistance(0)).toBe(0)
    expect(projectAngle(30, 200)).toBeCloseTo(129.8)
  })
})

describe('destino al soltar', () => {
  it('pasa de 90° respecto a la cara de partida → completa el giro en el sentido del gesto', () => {
    expect(flipTarget(0, 91)).toBe(180)
    expect(flipTarget(0, -120)).toBe(-180)
    expect(flipTarget(180, 280)).toBe(360) // acumula: segunda vuelta
    expect(flipTarget(180, 60)).toBe(0)
  })

  it('no llega → vuelve a la cara de partida', () => {
    expect(flipTarget(0, 89)).toBe(0)
    expect(flipTarget(0, -90)).toBe(0)
    expect(flipTarget(360, 300)).toBe(360)
  })

  it('como mucho media vuelta por gesto aunque el lanzamiento sea enorme', () => {
    expect(flipTarget(0, 2000)).toBe(180)
    expect(flipTarget(0, -2000)).toBe(-180)
  })

  it('arrastre corto con lanzamiento rápido sí gira; arrastre largo frenado en sentido contrario vuelve', () => {
    const quick = projectAngle(angleFromDrag(0, 30, 224), degreesPerSecond(600, 224)) // ~24° + ~241°
    expect(flipTarget(0, quick)).toBe(180)
    const back = projectAngle(angleFromDrag(0, 140, 224), degreesPerSecond(-300, 224)) // ~112° − ~120°
    expect(flipTarget(0, back)).toBe(0)
  })
})

describe('caras y vista', () => {
  it('cara más cercana', () => {
    expect(nearestFace(89)).toBe(0)
    expect(nearestFace(91)).toBe(180)
    expect(nearestFace(-200)).toBe(-180)
  })

  it.each([
    [0, 'front'],
    [180, 'back'],
    [360, 'front'],
    [540, 'back'],
    [-180, 'back'],
    [-360, 'front'],
    [80, 'front'],
    [100, 'back'],
  ] as const)('%d° → %s', (angle, view) => {
    expect(viewForAngle(angle)).toBe(view)
  })

  it('botones: cara más cercana con esa vista', () => {
    expect(angleForView(0, 'front')).toBe(0)
    expect(angleForView(0, 'back')).toBe(180)
    expect(angleForView(360, 'back')).toBe(540)
    expect(angleForView(180, 'front')).toBe(360)
    expect(angleForView(-180, 'front')).toBe(0)
    expect(angleForView(-20, 'back')).toBe(-180) // ya inclinada hacia atrás: sigue ese sentido
    expect(angleForView(150, 'back')).toBe(180) // a mitad de giro: la cara más cercana
  })
})

describe('velocidad al soltar', () => {
  it('px/s de las muestras de los últimos 100 ms', () => {
    const s = [
      { t: 0, x: 0 },
      { t: 500, x: 10 }, // antigua: no cuenta
      { t: 920, x: 100 },
      { t: 1000, x: 140 },
    ]
    expect(releaseVelocity(s, 1000)).toBeCloseTo(500)
  })

  it('sin muestras suficientes o dedo quieto → 0', () => {
    expect(releaseVelocity([], 0)).toBe(0)
    expect(releaseVelocity([{ t: 0, x: 5 }], 10)).toBe(0)
    expect(releaseVelocity([{ t: 0, x: 0 }, { t: 50, x: 30 }], 400)).toBe(0) // soltó tras pararse
  })
})

describe('luz y sombra', () => {
  it('oscuridad máxima de perfil', () => {
    expect(shadeOpacity(0)).toBeCloseTo(0)
    expect(shadeOpacity(90)).toBeCloseTo(0.5)
    expect(shadeOpacity(180)).toBeCloseTo(0)
    expect(shadeOpacity(-270)).toBeCloseTo(0.5)
  })

  it('sombra estrecha de perfil, entera de frente', () => {
    expect(shadowScaleX(0)).toBeCloseTo(1)
    expect(shadowScaleX(90)).toBeCloseTo(0.6)
    expect(shadowScaleX(180)).toBeCloseTo(1)
  })
})

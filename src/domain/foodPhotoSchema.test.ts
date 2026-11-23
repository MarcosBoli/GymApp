import { describe, expect, it } from 'vitest'
import { FoodPhotoEstimateSchema, FoodPhotoRequestSchema, foodPhotoErrors, sumEstimate, type FoodPhotoEstimate, type FoodPhotoItem } from './foodPhotoSchema'

const item = (over: Partial<FoodPhotoItem> = {}): FoodPhotoItem => ({
  nombre: 'Arroz blanco cocido',
  gramos: 150,
  kcal: 195,
  proteina: 4,
  carbohidratos: 42,
  grasa: 0.5,
  confianza: 'alta',
  nota: '',
  ...over,
})
const estimate = (items: FoodPhotoItem[], reconocida = true): FoodPhotoEstimate => ({ reconocida, items, totales: sumEstimate(items), comentario: 'Plato de arroz.' })

describe('petición', () => {
  const jpeg = '/9j/' + 'A'.repeat(200)
  it('acepta JPEG en base64 y nota opcional', () => {
    expect(FoodPhotoRequestSchema.safeParse({ image: jpeg }).success).toBe(true)
    expect(FoodPhotoRequestSchema.safeParse({ image: jpeg, note: 'con aceite' }).success).toBe(true)
  })
  it.each([
    [{ image: 'iVBORw0KGgo' + 'A'.repeat(200) }], // PNG
    [{ image: 'data:image/jpeg;base64,/9j/' + 'A'.repeat(200) }], // con cabecera
    [{ image: '/9j/' + 'A'.repeat(20) }], // demasiado corta
    [{ image: '/9j/ AAAA' + 'A'.repeat(200) }], // no es base64
    [{ image: jpeg, note: 'x'.repeat(301) }],
    [{}],
  ])('rechaza %#', (body) => {
    expect(FoodPhotoRequestSchema.safeParse(body).success).toBe(false)
  })
})

describe('salida y reglas', () => {
  it('estimación válida sin errores', () => {
    const e = estimate([item(), item({ nombre: 'Pechuga de pollo a la plancha', gramos: 120, kcal: 198, proteina: 37, carbohidratos: 0, grasa: 5.5 })])
    expect(FoodPhotoEstimateSchema.safeParse(e).success).toBe(true)
    expect(foodPhotoErrors(e)).toEqual([])
  })

  it('no reconocida y sin items es válida', () => {
    expect(foodPhotoErrors(estimate([], false))).toEqual([])
  })

  it('detecta incoherencias', () => {
    expect(foodPhotoErrors(estimate([]))).toHaveLength(1) // reconocida sin items
    expect(foodPhotoErrors(estimate([item({ kcal: 600 })]))[0]).toContain('no cuadra con los macros')
    expect(foodPhotoErrors(estimate([item({ gramos: 10, kcal: 120, proteina: 0, carbohidratos: 0, grasa: 13 })])).join()).toContain('950 kcal')
    expect(foodPhotoErrors(estimate([item({ gramos: 20 })])).join()).toContain('pesan más que los gramos')
  })

  it('esquema: confianza cerrada, gramos > 0', () => {
    expect(FoodPhotoEstimateSchema.safeParse(estimate([item({ confianza: 'segura' as 'alta' })])).success).toBe(false)
    expect(FoodPhotoEstimateSchema.safeParse(estimate([item({ gramos: 0 })])).success).toBe(false)
  })

  it('sumEstimate redondea', () => {
    expect(sumEstimate([item(), item({ kcal: 100.4, proteina: 1.04 })])).toEqual({ kcal: 295, proteina: 5, carbohidratos: 84, grasa: 1 })
  })
})

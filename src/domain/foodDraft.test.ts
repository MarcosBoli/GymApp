import { describe, expect, it } from 'vitest'
import type { EstimateToolInput } from './foodEstimateSchema'
import {
  addDraftItem,
  draftFromEstimate,
  draftItemNutrition,
  draftTotals,
  EMPTY_MANUAL_ITEM,
  foodValuesFromDraft,
  per100From,
  removeDraftItem,
  setDraftGrams,
  validateManualItem,
} from './foodDraft'

const estimate: EstimateToolInput = {
  reconocida: true,
  items: [
    { nombre: ' Arroz blanco cocido ', gramos: 150, kcal: 195, proteina: 4.5, carbohidratos: 42, grasa: 0.6, confianza: 'alta', supuesto: '' },
    { nombre: 'Pollo a la plancha', gramos: 120, kcal: 220, proteina: 37, carbohidratos: 0, grasa: 8, confianza: 'media', supuesto: ' con aceite ' },
  ],
  totales: { kcal: 415, proteina: 41.5, carbohidratos: 42, grasa: 8.6 },
  comentario: '',
}

describe('borrador desde la estimación', () => {
  const draft = draftFromEstimate(estimate)

  it('valores por 100 g, nombres y notas limpios, confianza', () => {
    expect(draft[0]).toMatchObject({ key: 'ia0', name: 'Arroz blanco cocido', grams: 150, confidence: 'alta', assumption: '' })
    expect(draft[0]!.per100.kcal).toBeCloseTo(130)
    expect(draft[0]!.per100.proteinG).toBeCloseTo(3)
    expect(draft[1]).toMatchObject({ key: 'ia1', assumption: 'con aceite', confidence: 'media' })
  })

  it('la porción reproduce la estimación y los totales suman', () => {
    expect(draftItemNutrition(draft[1]!)).toMatchObject({ kcal: expect.closeTo(220), proteinG: expect.closeTo(37), fatG: expect.closeTo(8) })
    expect(draftTotals(draft).kcal).toBeCloseTo(415)
  })

  it('cambiar los gramos recalcula en proporción', () => {
    const d = setDraftGrams(draft, 'ia0', 300)
    expect(draftItemNutrition(d[0]!)).toMatchObject({ kcal: expect.closeTo(390), carbsG: expect.closeTo(84) })
    expect(d[1]).toBe(draft[1]) // el resto no cambia
    expect(draftTotals(d).kcal).toBeCloseTo(610)
  })

  it('gramos no válidos se ignoran', () => {
    for (const g of [0, -5, Number.NaN, 6000]) expect(setDraftGrams(draft, 'ia0', g)).toEqual(draft)
  })

  it('borrar', () => {
    expect(removeDraftItem(draft, 'ia0').map((i) => i.key)).toEqual(['ia1'])
  })

  it('per100From con 0 g no divide por cero', () => {
    expect(per100From({ kcal: 10, proteinG: 1, carbsG: 1, fatG: 1 }, 0)).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })
  })
})

describe('añadir a mano', () => {
  it('valida y añade con valores de la porción', () => {
    const r = validateManualItem({ name: ' Pan ', grams: '40', kcal: '100', proteinG: '3,5', carbsG: '20', fatG: '' })
    expect(r).toEqual({ ok: true, value: { name: 'Pan', grams: 40, portion: { kcal: 100, proteinG: 3.5, carbsG: 20, fatG: 0 } } })
    if (!r.ok) return
    const d = addDraftItem(addDraftItem(draftFromEstimate(estimate), r.value), r.value)
    expect(d.map((i) => i.key)).toEqual(['ia0', 'ia1', 'm0', 'm1'])
    expect(d[2]).toMatchObject({ confidence: null, per100: { kcal: 250 } })
  })

  it('errores comprensibles', () => {
    const r = validateManualItem(EMPTY_MANUAL_ITEM)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.errors).sort()).toEqual(['grams', 'kcal', 'name'])
    const heavy = validateManualItem({ name: 'x', grams: '10', kcal: '50', proteinG: '5', carbsG: '5', fatG: '5' })
    expect(heavy.ok === false && heavy.errors.fatG).toContain('pesar más')
  })
})

describe('guardar', () => {
  it('valores por 100 g redondeados y la porción como ración', () => {
    const [rice] = draftFromEstimate(estimate)
    expect(foodValuesFromDraft(setDraftGrams([rice!], 'ia0', 175)[0]!)).toEqual({ name: 'Arroz blanco cocido', kcal: 130, proteinG: 3, carbsG: 28, fatG: 0.4, servingG: 175 })
  })
})

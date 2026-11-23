import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDb, type GymDB } from './db'
import { resolveBarcode } from './barcode'
import { findFoodByBarcode, saveFood } from './food'

let n = 0
const opened: GymDB[] = []
const fresh = () => {
  const db = createDb(`bc-${++n}`)
  opened.push(db)
  return db
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete()
})

const CODE = '3017620422003'
const OFF = {
  product: {
    product_name: 'Nutella',
    brands: 'Ferrero',
    serving_quantity: 15,
    nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
  },
}

describe('resolveBarcode', () => {
  it('Open Food Facts → guarda en foods y la segunda vez sale de local sin red', async () => {
    const db = fresh()
    const fetchProduct = vi.fn().mockResolvedValue(OFF)
    const r1 = await resolveBarcode(CODE, 1, { fetchProduct, online: true }, db)
    expect(r1).toMatchObject({ kind: 'found', from: 'openfoodfacts', food: { name: 'Nutella', brand: 'Ferrero', servingG: 15, source: 'openfoodfacts' } })
    expect(await findFoodByBarcode(CODE, db)).toBeDefined()

    const r2 = await resolveBarcode(CODE, 2, { fetchProduct, online: false }, db)
    expect(r2).toMatchObject({ kind: 'found', from: 'local' })
    expect(fetchProduct).toHaveBeenCalledOnce()
  })

  it('alimento creado a mano con ese código: no consulta la red', async () => {
    const db = fresh()
    await saveFood({ name: 'Mío', barcode: CODE, kcal: 1, proteinG: 0, carbsG: 0, fatG: 0 }, 1, {}, db)
    const fetchProduct = vi.fn()
    expect(await resolveBarcode(CODE, 1, { fetchProduct, online: true }, db)).toMatchObject({ kind: 'found', from: 'local' })
    expect(fetchProduct).not.toHaveBeenCalled()
  })

  it.each([
    ['sin conexión', { online: false, fetchProduct: vi.fn() }, 'offline'],
    ['no existe', { online: true, fetchProduct: vi.fn().mockResolvedValue(null) }, 'not_found'],
    ['status 0', { online: true, fetchProduct: vi.fn().mockResolvedValue({ status: 0 }) }, 'not_found'],
    ['error de red', { online: true, fetchProduct: vi.fn().mockRejectedValue(new Error('x')) }, 'error'],
  ])('%s → borrador con el código', async (_, deps, reason) => {
    const db = fresh()
    expect(await resolveBarcode(CODE, 1, deps, db)).toEqual({ kind: 'draft', draft: { name: '', barcode: CODE }, reason })
    expect(await db.foods.count()).toBe(0)
  })

  it('producto incompleto → borrador con lo que haya, sin guardar', async () => {
    const db = fresh()
    const partial = { product: { product_name: 'Galletas', nutriments: { 'energy-kcal_100g': 480 } } }
    const r = await resolveBarcode(CODE, 1, { online: true, fetchProduct: vi.fn().mockResolvedValue(partial) }, db)
    expect(r).toMatchObject({ kind: 'draft', reason: 'incomplete', draft: { name: 'Galletas', kcal: 480, barcode: CODE } })
    expect(await db.foods.count()).toBe(0)
  })
})

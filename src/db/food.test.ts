import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type GymDB } from './db'
import {
  addFoodToMeal,
  deleteMealItem,
  findFoodByBarcode,
  getDailyNutrition,
  getDayMeals,
  getEnergyInputs,
  listFavoriteFoods,
  listRecentFoods,
  logBodyweight,
  saveFood,
  toggleFavorite,
  updateMealItemGrams,
} from './food'

let n = 0
const opened: GymDB[] = []
const fresh = () => {
  const db = createDb(`food-${++n}`)
  opened.push(db)
  return db
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete()
})

const T = 1_700_000_000_000
const rice = { name: 'Arroz', kcal: 360, proteinG: 7, carbsG: 79, fatG: 1 }
const nutella = { name: 'Nutella', brand: 'Ferrero', barcode: '3017620422003', kcal: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9, servingG: 15 }

describe('alimentos', () => {
  it('crea, busca por código y no duplica al volver a escanear', async () => {
    const db = fresh()
    const a = await saveFood(nutella, T, { source: 'openfoodfacts' }, db)
    expect(a).toMatchObject({ source: 'openfoodfacts', isFavorite: false, createdAt: T })
    const b = await saveFood({ ...nutella, kcal: 540 }, T + 1, {}, db)
    expect(b.id).toBe(a.id)
    expect(b).toMatchObject({ kcal: 540, createdAt: T, source: 'openfoodfacts' })
    expect(await db.foods.count()).toBe(1)
    expect((await findFoodByBarcode('3017620422003', db))?.kcal).toBe(540)
  })

  it('editar por id', async () => {
    const db = fresh()
    const a = await saveFood(rice, T, {}, db)
    await saveFood({ ...rice, name: 'Arroz blanco' }, T, { id: a.id }, db)
    expect((await db.foods.get(a.id))?.name).toBe('Arroz blanco')
  })

  it('favoritos', async () => {
    const db = fresh()
    const a = await saveFood(rice, T, {}, db)
    await saveFood(nutella, T, {}, db)
    await toggleFavorite(a.id, db)
    expect((await listFavoriteFoods(db)).map((f) => f.name)).toEqual(['Arroz'])
    await toggleFavorite(a.id, db)
    expect(await listFavoriteFoods(db)).toEqual([])
  })
})

describe('comidas', () => {
  it('añadir, agrupar por comida, editar gramos y borrar', async () => {
    const db = fresh()
    const r = await saveFood(rice, T, {}, db)
    const nu = await saveFood(nutella, T, {}, db)
    const i1 = await addFoodToMeal('2026-11-23', 'lunch', r, 150, T, db)
    await addFoodToMeal('2026-11-23', 'lunch', nu, 20, T + 1, db)
    await addFoodToMeal('2026-11-23', 'snack', nu, 15, T + 2, db)
    expect(await db.meals.count()).toBe(2) // reutiliza la comida del mismo tipo

    let day = await getDayMeals('2026-11-23', db)
    expect(day.byType.lunch.items).toHaveLength(2)
    expect(day.byType.lunch.totals.kcal).toBeCloseTo(540 + 107.8)
    expect(day.byType.breakfast.items).toEqual([])
    expect(day.totals.kcal).toBeCloseTo(540 + 107.8 + 80.85)

    await updateMealItemGrams(i1.id, 100, db)
    day = await getDayMeals('2026-11-23', db)
    expect(day.byType.lunch.totals.kcal).toBeCloseTo(360 + 107.8)

    // editar el alimento no cambia el histórico (snapshot)
    await saveFood({ ...rice, kcal: 999 }, T, { id: r.id }, db)
    expect((await getDayMeals('2026-11-23', db)).byType.lunch.items[0]!.kcal).toBe(360)

    for (const item of day.byType.snack.items) await deleteMealItem(item.id, db)
    expect(await db.meals.count()).toBe(1) // la comida vacía se borra
  })

  it('recientes: distintos, el más reciente primero', async () => {
    const db = fresh()
    const r = await saveFood(rice, T, {}, db)
    const nu = await saveFood(nutella, T, {}, db)
    const old = await saveFood({ ...rice, name: 'Viejo' }, T, {}, db)
    await addFoodToMeal('2026-09-01', 'lunch', old, 100, T, db)
    await addFoodToMeal('2026-11-20', 'lunch', r, 100, T, db)
    await addFoodToMeal('2026-11-22', 'dinner', nu, 20, T, db)
    await addFoodToMeal('2026-11-22', 'lunch', r, 100, T - 1, db)
    expect((await listRecentFoods('2026-11-23', 15, 30, db)).map((f) => f.name)).toEqual(['Nutella', 'Arroz'])
  })

  it('nutrición diaria por rango de fechas', async () => {
    const db = fresh()
    const r = await saveFood(rice, T, {}, db)
    await addFoodToMeal('2026-11-21', 'lunch', r, 100, T, db)
    await addFoodToMeal('2026-11-23', 'lunch', r, 200, T, db)
    await addFoodToMeal('2026-11-23', 'dinner', r, 100, T, db)
    await addFoodToMeal('2026-11-25', 'dinner', r, 100, T, db)
    const days = await getDailyNutrition('2026-11-20', '2026-11-23', db)
    expect(days.map((d) => [d.date, d.kcal])).toEqual([['2026-11-21', 360], ['2026-11-23', 1080]])
  })

  it('entradas para Inicio', async () => {
    const db = fresh()
    await logBodyweight('2026-11-22', 80, db)
    await logBodyweight('2026-11-22', 79.6, db) // mismo día: sobrescribe
    await logBodyweight('2026-11-30', 70, db) // futuro: fuera
    const inputs = await getEnergyInputs('2026-11-23', db)
    expect(inputs.weights).toEqual([{ date: '2026-11-22', weightKg: 79.6 }])
    expect(inputs.profile).toBeUndefined()
    expect(inputs.days).toEqual([])
  })
})

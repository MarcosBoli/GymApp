import type { DateKey, Food, Meal, MealItem, MealType } from '../domain/types'
import { itemNutrition, mealItemSnapshot, sumNutrition, ZERO_NUTRITION, type FoodValues, type Nutrition } from '../domain/food'
import type { DayNutrition } from '../domain/energy'
import { addDays } from '../domain/dates'
import { db as defaultDb, type GymDB } from './db'
import { newId } from './ids'

// ─── Alimentos ─────────────────────────────────────────────────────────────

export async function findFoodByBarcode(barcode: string, db: GymDB = defaultDb): Promise<Food | undefined> {
  return db.foods.where('barcode').equals(barcode).first()
}

/**
 * Crea o actualiza un alimento. Si ya existe uno con el mismo código de barras se
 * actualiza ese (evita duplicados al escanear dos veces). Devuelve el alimento guardado.
 */
export async function saveFood(
  values: FoodValues,
  now: number,
  opts: { id?: string; source?: Food['source'] } = {},
  db: GymDB = defaultDb,
): Promise<Food> {
  return db.transaction('rw', db.foods, async () => {
    const existing = opts.id ? await db.foods.get(opts.id) : values.barcode ? await findFoodByBarcode(values.barcode, db) : undefined
    const food: Food = {
      ...values,
      id: existing?.id ?? newId(),
      isFavorite: existing?.isFavorite ?? false,
      source: opts.source ?? existing?.source ?? 'manual',
      createdAt: existing?.createdAt ?? now,
    }
    await db.foods.put(food)
    return food
  })
}

export async function toggleFavorite(foodId: string, db: GymDB = defaultDb): Promise<void> {
  await db.foods.where('id').equals(foodId).modify((f) => {
    f.isFavorite = !f.isFavorite
  })
}

export async function listFavoriteFoods(db: GymDB = defaultDb): Promise<Food[]> {
  return (await db.foods.filter((f) => f.isFavorite === true).toArray()).sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/** Alimentos usados recientemente (de las comidas de los últimos `days` días), el más reciente primero. */
export async function listRecentFoods(today: DateKey, limit = 15, days = 30, db: GymDB = defaultDb): Promise<Food[]> {
  const meals = await db.meals.where('date').between(addDays(today, -days), today, true, true).toArray()
  meals.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  const items = await db.mealItems.where('mealId').anyOf(meals.map((m) => m.id)).toArray()
  const order = new Map(meals.map((m, i) => [m.id, i]))
  items.sort((a, b) => order.get(a.mealId)! - order.get(b.mealId)!)
  const ids = [...new Set(items.map((i) => i.foodId))].slice(0, limit)
  const foods = await db.foods.bulkGet(ids)
  return foods.filter((f): f is Food => f !== undefined)
}

// ─── Comidas ───────────────────────────────────────────────────────────────

/** Añade `grams` del alimento a la comida del día (la crea si no existe). */
export async function addFoodToMeal(
  date: DateKey,
  type: MealType,
  food: Food,
  grams: number,
  now: number,
  db: GymDB = defaultDb,
): Promise<MealItem> {
  return db.transaction('rw', [db.meals, db.mealItems], async () => {
    let meal = await db.meals.where('[date+type]').equals([date, type]).first()
    if (!meal) {
      meal = { id: newId(), date, type, createdAt: now }
      await db.meals.add(meal)
    }
    const item: MealItem = { id: newId(), mealId: meal.id, grams, createdAt: now, ...mealItemSnapshot(food) }
    await db.mealItems.add(item)
    return item
  })
}

export async function updateMealItemGrams(itemId: string, grams: number, db: GymDB = defaultDb): Promise<void> {
  await db.mealItems.update(itemId, { grams })
}

/** Borra el alimento de la comida; si la comida queda vacía, la borra también. */
export async function deleteMealItem(itemId: string, db: GymDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.meals, db.mealItems], async () => {
    const item = await db.mealItems.get(itemId)
    if (!item) return
    await db.mealItems.delete(itemId)
    if ((await db.mealItems.where('mealId').equals(item.mealId).count()) === 0) await db.meals.delete(item.mealId)
  })
}

export interface DayMeals {
  byType: Record<MealType, { meal?: Meal; items: MealItem[]; totals: Nutrition }>
  totals: Nutrition
}

export async function getDayMeals(date: DateKey, db: GymDB = defaultDb): Promise<DayMeals> {
  const meals = await db.meals.where('date').equals(date).toArray()
  const items = await db.mealItems.where('mealId').anyOf(meals.map((m) => m.id)).toArray()
  const empty = () => ({ items: [] as MealItem[], totals: { ...ZERO_NUTRITION } })
  const byType: DayMeals['byType'] = { breakfast: empty(), lunch: empty(), dinner: empty(), snack: empty() }
  for (const meal of meals.sort((a, b) => a.createdAt - b.createdAt)) {
    const own = items.filter((i) => i.mealId === meal.id).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    const slot = byType[meal.type]
    slot.meal ??= meal
    slot.items.push(...own)
  }
  for (const slot of Object.values(byType)) slot.totals = sumNutrition(slot.items.map(itemNutrition))
  return { byType, totals: sumNutrition(Object.values(byType).map((s) => s.totals)) }
}

/** Totales por día con comida registrada en [from, to]. */
export async function getDailyNutrition(from: DateKey, to: DateKey, db: GymDB = defaultDb): Promise<DayNutrition[]> {
  const meals = await db.meals.where('date').between(from, to, true, true).toArray()
  const items = await db.mealItems.where('mealId').anyOf(meals.map((m) => m.id)).toArray()
  const dateOf = new Map(meals.map((m) => [m.id, m.date]))
  const byDate = new Map<DateKey, Nutrition[]>()
  for (const i of items) {
    const d = dateOf.get(i.mealId)!
    byDate.set(d, [...(byDate.get(d) ?? []), itemNutrition(i)])
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, ...sumNutrition(list) }))
}

// ─── Peso e Inicio ─────────────────────────────────────────────────────────

export async function logBodyweight(date: DateKey, weightKg: number, db: GymDB = defaultDb): Promise<void> {
  await db.bodyweightLogs.put({ date, weightKg })
}

/** Datos para energyOverview: perfil, pesajes y nutrición diaria de los últimos 60 días. */
export async function getEnergyInputs(today: DateKey, db: GymDB = defaultDb) {
  const [profile, weights, days] = await Promise.all([
    db.userProfile.get('me'),
    db.bodyweightLogs.where('date').belowOrEqual(today).toArray(),
    getDailyNutrition(addDays(today, -60), today, db),
  ])
  return { profile, weights, days, today }
}

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type GymDB } from './db'
import { getCachedRecipe, getRecipe, listFavoriteRecipes, saveRecipe, setRecipeFavorite } from './recipes'
import { exportAll } from './backup'
import { saveEstimatedFoods } from './food'
import { draftFromRecipe } from '../domain/recipes'
import type { Recipe, Suggestion } from '../domain/mealSchema'

let n = 0
const opened: GymDB[] = []
const fresh = () => {
  const db = createDb(`recipes-${++n}`)
  opened.push(db)
  return db
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete()
})

const option = (nombre: string): Suggestion => ({ id: 's1', nombre, tipo: 'sencilla', descripcion: 'x.', tiempoMin: 10, dificultad: 'facil', raciones: 1, gramosRacion: 300, kcal: 400, proteina: 30, carbohidratos: 40, grasa: 13, ingredientesClave: ['pollo'], porQueEncaja: 'x.' })
const recipe = (nombre: string): Recipe => ({ nombre, raciones: 1, tiempoTotal: 10, ingredientes: [{ nombre: 'Pollo', gramos: 150, kcal: 165, proteina: 33, carbohidratos: 0, grasa: 3.6 }, { nombre: 'Arroz', gramos: 60, kcal: 210, proteina: 4, carbohidratos: 46, grasa: 0.5 }], pasos: [{ texto: 'Cocina.' }], kcal: 375, proteina: 37, carbohidratos: 46, grasa: 4.1 })
const T = 1_700_000_000_000

describe('recetas en Dexie', () => {
  it('caché por nombre (sin tildes ni mayúsculas) y actualización sin duplicar', async () => {
    const db = fresh()
    const a = await saveRecipe(option('Pollo con arroz'), recipe('Pollo con arroz'), T, db)
    expect((await getCachedRecipe('POLLO CON ARRÓZ', db))?.id).toBe(a.id) // sin tildes ni mayúsculas
    expect(await getCachedRecipe('Pollo con patatas', db)).toBeUndefined()
    expect((await getCachedRecipe('pollo con arroz', db))?.id).toBe(a.id)
    await setRecipeFavorite(a.id, true, T + 1, db)
    const b = await saveRecipe(option('Pollo con arroz'), { ...recipe('Pollo con arroz'), tiempoTotal: 12 }, T + 2, db)
    expect(b).toMatchObject({ id: a.id, isFavorite: true, createdAt: T, updatedAt: T + 2 })
    expect(await db.recipes.count()).toBe(1)
    expect((await getRecipe(a.id, db))?.recipe.tiempoTotal).toBe(12)
  })

  it('"Mis recetas": solo favoritas, la última primero', async () => {
    const db = fresh()
    const a = await saveRecipe(option('Tortilla'), recipe('Tortilla'), T, db)
    const b = await saveRecipe(option('Lentejas'), recipe('Lentejas'), T, db)
    await saveRecipe(option('Ensalada'), recipe('Ensalada'), T, db)
    await setRecipeFavorite(a.id, true, T + 5, db)
    await setRecipeFavorite(b.id, true, T + 9, db)
    expect((await listFavoriteRecipes(db)).map((r) => r.recipe.nombre)).toEqual(['Lentejas', 'Tortilla'])
    await setRecipeFavorite(b.id, false, T + 10, db)
    expect((await listFavoriteRecipes(db)).map((r) => r.recipe.nombre)).toEqual(['Tortilla'])
  })

  it('entran en el backup', async () => {
    const db = fresh()
    await saveRecipe(option('Tortilla'), recipe('Tortilla'), T, db)
    expect((await exportAll(new Date(T), db)).tables.recipes).toHaveLength(1)
  })

  it('"Me la he comido": ingredientes guardados como ia-receta y en la comida', async () => {
    const db = fresh()
    const items = await saveEstimatedFoods('2026-11-24', 'dinner', draftFromRecipe(recipe('Pollo con arroz')), 'ia-receta', T, db)
    expect(items.map((i) => [i.foodName, i.grams])).toEqual([['Pollo', 150], ['Arroz', 60]])
    expect((await db.foods.toArray()).every((f) => f.source === 'ia-receta')).toBe(true)
  })
})

describe('getMealSuggestInputs', () => {
  it('comidas de los últimos 3 días (hoy incluido) y preferencias del perfil', async () => {
    const { getMealSuggestInputs } = await import('./mealSuggest')
    const { addFoodToMeal, saveFood } = await import('./food')
    const db = fresh()
    const food = (name: string) => saveFood({ name, kcal: 100, proteinG: 5, carbsG: 10, fatG: 3 }, T, {}, db)
    await addFoodToMeal('2026-11-24', 'lunch', await food('Lentejas'), 300, T, db)
    await addFoodToMeal('2026-11-22', 'dinner', await food('Tortilla'), 200, T, db)
    await addFoodToMeal('2026-11-21', 'dinner', await food('Paella'), 300, T, db) // fuera
    await db.userProfile.put({ id: 'me', sex: 'male', birthDate: '1995-01-01', heightCm: 180, activityLevel: 'moderate', goal: 'lose', diet: 'omnivora', budget: 'bajo', utensils: ['sarten'], maxCookMinutes: 20, updatedAt: T })
    const r = await getMealSuggestInputs('2026-11-24', db)
    expect(r.recentNames).toEqual(['Lentejas', 'Tortilla'])
    expect(r.prefs).toMatchObject({ dieta: 'omnivora', tiempoMaxMin: 20 })
    expect(r.goal).toBe('lose')
    expect(r.overview.ready).toBe(false) // sin peso registrado
  })
})

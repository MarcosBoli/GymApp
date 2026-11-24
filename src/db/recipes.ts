import type { SavedRecipe } from '../domain/types'
import type { Recipe, Suggestion } from '../domain/mealSchema'
import { recipeKey } from '../domain/recipes'
import { db as defaultDb, type GymDB } from './db'
import { newId } from './ids'

/** Receta ya generada para esa opción (por nombre): se reutiliza sin volver a gastar IA. */
export function getCachedRecipe(name: string, db: GymDB = defaultDb): Promise<SavedRecipe | undefined> {
  return db.recipes.where('key').equals(recipeKey(name)).first()
}

export function getRecipe(id: string, db: GymDB = defaultDb): Promise<SavedRecipe | undefined> {
  return db.recipes.get(id)
}

/** Guarda (o actualiza) la receta de una opción; conserva si era favorita. */
export async function saveRecipe(option: Suggestion, recipe: Recipe, now: number, db: GymDB = defaultDb): Promise<SavedRecipe> {
  return db.transaction('rw', db.recipes, async () => {
    const existing = await getCachedRecipe(option.nombre, db)
    const row: SavedRecipe = {
      id: existing?.id ?? newId(),
      key: recipeKey(option.nombre),
      option,
      recipe,
      isFavorite: existing?.isFavorite ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await db.recipes.put(row)
    return row
  })
}

export async function setRecipeFavorite(id: string, isFavorite: boolean, now: number, db: GymDB = defaultDb): Promise<void> {
  await db.recipes.update(id, { isFavorite, updatedAt: now })
}

/** "Mis recetas": favoritas, la última guardada primero. */
export async function listFavoriteRecipes(db: GymDB = defaultDb): Promise<SavedRecipe[]> {
  return (await db.recipes.filter((r) => r.isFavorite).toArray()).sort((a, b) => b.updatedAt - a.updatedAt)
}

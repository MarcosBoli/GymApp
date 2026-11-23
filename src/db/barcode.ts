import type { Food } from '../domain/types'
import { isCompleteDraft, parseOffProduct, type FoodDraft } from '../domain/food'
import { db as defaultDb, type GymDB } from './db'
import { findFoodByBarcode, saveFood } from './food'

export type BarcodeResolution =
  | { kind: 'found'; food: Food; from: 'local' | 'openfoodfacts' }
  | { kind: 'draft'; draft: FoodDraft; reason: 'not_found' | 'incomplete' | 'offline' | 'error' }

/**
 * 1. Busca el código en local (funciona sin conexión).
 * 2. Si no está, pregunta a Open Food Facts y, si el producto viene completo, lo guarda
 *    en `foods` para usarlo después offline.
 * 3. Si no se encuentra, viene incompleto o no hay red: borrador para el alta manual.
 */
export async function resolveBarcode(
  barcode: string,
  now: number,
  deps: { fetchProduct: (code: string) => Promise<unknown | null>; online: boolean },
  db: GymDB = defaultDb,
): Promise<BarcodeResolution> {
  const local = await findFoodByBarcode(barcode, db)
  if (local) return { kind: 'found', food: local, from: 'local' }
  if (!deps.online) return { kind: 'draft', draft: { name: '', barcode }, reason: 'offline' }

  let json: unknown
  try {
    json = await deps.fetchProduct(barcode)
  } catch {
    return { kind: 'draft', draft: { name: '', barcode }, reason: 'error' }
  }
  const draft = parseOffProduct(json, barcode)
  if (!draft) return { kind: 'draft', draft: { name: '', barcode }, reason: 'not_found' }
  if (!isCompleteDraft(draft)) return { kind: 'draft', draft, reason: 'incomplete' }

  const food = await saveFood(
    {
      name: draft.name,
      kcal: draft.kcal!,
      proteinG: draft.proteinG!,
      carbsG: draft.carbsG!,
      fatG: draft.fatG!,
      barcode,
      ...(draft.brand ? { brand: draft.brand } : {}),
      ...(draft.servingG ? { servingG: draft.servingG } : {}),
    },
    now,
    { source: 'openfoodfacts' },
    db,
  )
  return { kind: 'found', food, from: 'openfoodfacts' }
}

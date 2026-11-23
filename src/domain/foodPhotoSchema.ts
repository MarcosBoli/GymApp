/**
 * Estimación de comida a partir de una foto (/api/food-photo): petición, salida de la IA
 * (herramienta con claves en español) y reglas de coherencia. Solo importa zod: lo usan
 * también las funciones del servidor.
 */
import { z } from 'zod'

/** Límite del cuerpo de /api/food-photo (la foto viaja en base64; la app la deja en ~150-400 KB). */
export const FOOD_PHOTO_MAX_BODY_BYTES = 1_500_000
export const FOOD_PHOTO_NOTE_MAX = 300
export const FOOD_PHOTO_MAX_ITEMS = 15

/** JPEG en base64 sin cabecera data:… (empieza por /9j/, los bytes FF D8 FF). */
const jpegBase64 = z
  .string()
  .min(100)
  .regex(/^\/9j\/[A-Za-z0-9+/]+={0,2}$/, 'La imagen debe ser un JPEG en base64')

export const FoodPhotoRequestSchema = z.object({
  image: jpegBase64,
  note: z.string().max(FOOD_PHOTO_NOTE_MAX).optional(),
})
export type FoodPhotoRequest = z.infer<typeof FoodPhotoRequestSchema>

export const CONFIDENCE_LEVELS = ['alta', 'media', 'baja'] as const
export type Confidence = (typeof CONFIDENCE_LEVELS)[number]

const nonNeg = (max: number) => z.number().min(0).max(max)

export const FoodPhotoItemSchema = z.object({
  nombre: z.string().min(1).max(80).describe('Nombre del alimento en español, concreto (p. ej. "Arroz blanco cocido")'),
  gramos: z.number().gt(0).max(3000).describe('Gramos estimados de la porción visible'),
  kcal: nonNeg(5000).describe('kcal de esa porción'),
  proteina: nonNeg(500).describe('Proteína (g) de esa porción'),
  carbohidratos: nonNeg(800).describe('Carbohidratos (g) de esa porción'),
  grasa: nonNeg(400).describe('Grasa (g) de esa porción, incluido el aceite o la salsa probables'),
  confianza: z.enum(CONFIDENCE_LEVELS).describe('Confianza en la identificación y la cantidad'),
  nota: z.string().max(200).describe('Breve: supuestos (aceite, salsa, tamaño) o cadena vacía'),
})
export type FoodPhotoItem = z.infer<typeof FoodPhotoItemSchema>

const totalsSchema = z.object({ kcal: nonNeg(20000), proteina: nonNeg(2000), carbohidratos: nonNeg(3000), grasa: nonNeg(1500) })

export const FoodPhotoEstimateSchema = z.object({
  reconocida: z.boolean().describe('false si la foto no es comida o no se distingue lo que hay'),
  items: z.array(FoodPhotoItemSchema).max(FOOD_PHOTO_MAX_ITEMS).describe('Un elemento por alimento visible; vacío si no reconocida'),
  totales: totalsSchema.describe('Suma de los items'),
  comentario: z.string().max(400).describe('1-2 frases en español: qué ves y los supuestos principales, o por qué no se puede estimar'),
})
export type FoodPhotoEstimate = z.infer<typeof FoodPhotoEstimateSchema>

export interface FoodPhotoResponse {
  estimate: FoodPhotoEstimate
  model: string
}

/**
 * Reglas que el esquema no expresa. Devuelve los errores (vacío = válida):
 * reconocida sin alimentos, kcal incoherentes con los macros (4/4/9) o densidad imposible.
 */
export function foodPhotoErrors(e: FoodPhotoEstimate): string[] {
  const errors: string[] = []
  if (e.reconocida && e.items.length === 0) errors.push('reconocida es true pero no hay items: añade los alimentos o pon reconocida en false.')
  for (const [i, it] of e.items.entries()) {
    const fromMacros = it.proteina * 4 + it.carbohidratos * 4 + it.grasa * 9
    if (Math.abs(it.kcal - fromMacros) > Math.max(40, 0.25 * Math.max(it.kcal, fromMacros))) {
      errors.push(`items[${i}] (${it.nombre}): kcal ${it.kcal} no cuadra con los macros (${Math.round(fromMacros)} kcal con 4/4/9).`)
    }
    if ((it.kcal / it.gramos) * 100 > 950) errors.push(`items[${i}] (${it.nombre}): más de 950 kcal por 100 g, revisa gramos o kcal.`)
    if (it.proteina + it.carbohidratos + it.grasa > it.gramos * 1.05) errors.push(`items[${i}] (${it.nombre}): los macros pesan más que los gramos del alimento.`)
  }
  return errors
}

/** Totales recalculados desde los items (no se confía en la suma del modelo). */
export function sumEstimate(items: readonly FoodPhotoItem[]): FoodPhotoEstimate['totales'] {
  const t = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, proteina: a.proteina + i.proteina, carbohidratos: a.carbohidratos + i.carbohidratos, grasa: a.grasa + i.grasa }), { kcal: 0, proteina: 0, carbohidratos: 0, grasa: 0 })
  const r = (n: number) => Math.round(n * 10) / 10
  return { kcal: Math.round(t.kcal), proteina: r(t.proteina), carbohidratos: r(t.carbohidratos), grasa: r(t.grasa) }
}

/**
 * Estimación de comida con IA a partir de texto, foto o ambos (/api/food-estimate):
 * petición, las dos respuestas posibles de la IA (estimación o preguntas de aclaración,
 * cada una una herramienta con claves en español) y reglas de coherencia.
 * Solo importa zod: lo usan también las funciones del servidor.
 */
import { z } from 'zod'

/** Límite del cuerpo (la foto viaja en base64; la app la deja en ~150-400 KB). */
export const FOOD_ESTIMATE_MAX_BODY_BYTES = 1_500_000
export const FOOD_DESCRIPTION_MAX = 1000
export const FOOD_ESTIMATE_MAX_ITEMS = 15
export const MAX_QUESTIONS_PER_ROUND = 3
/** Tandas de preguntas como máximo; después la IA siempre estima. */
export const MAX_QUESTION_ROUNDS = 2
/** Opción que la app añade a cada pregunta. */
export const DONT_KNOW = 'No lo sé'

// ─── Preguntas ─────────────────────────────────────────────────────────────

export const QuestionSchema = z.object({
  id: z.string().min(1).max(30).describe('Identificador corto (p. ej. "racion")'),
  texto: z.string().min(3).max(140).describe('Pregunta breve en español'),
  opciones: z.array(z.string().min(1).max(40)).min(2).max(4).describe('2-4 respuestas cortas típicas, con cantidades orientativas (p. ej. "Normal (~250 g)"). No incluyas "No lo sé": lo añade la app'),
})
export type Question = z.infer<typeof QuestionSchema>

/** Pregunta ya hecha, con el id que le pone el servidor: r<tanda>q<n>. */
export const AskedQuestionSchema = QuestionSchema.extend({ id: z.string().regex(/^r[1-9]q[1-9]$/) })
export type AskedQuestion = z.infer<typeof AskedQuestionSchema>

export const AnswerSchema = z.object({ questionId: z.string().regex(/^r[1-9]q[1-9]$/), answer: z.string().min(1).max(60) })
export type Answer = z.infer<typeof AnswerSchema>

export const QuestionsToolSchema = z.object({
  questions: z.array(QuestionSchema).min(1).max(MAX_QUESTIONS_PER_ROUND).describe('Solo las preguntas imprescindibles, en una sola tanda'),
})

/** Tanda (1, 2…) de una pregunta según su id. */
export const questionRound = (id: string): number => Number(/^r(\d)q/.exec(id)?.[1] ?? 0)

/** Tandas de preguntas ya hechas. */
export const roundsAsked = (questions: readonly Pick<AskedQuestion, 'id'>[] = []): number => Math.max(0, ...questions.map((q) => questionRound(q.id)))

/** Errores de una tanda de preguntas que el esquema no expresa (vacío = válida). */
export function questionErrors(qs: readonly Question[]): string[] {
  const errors: string[] = []
  if (new Set(qs.map((q) => q.texto.trim().toLowerCase())).size !== qs.length) errors.push('Hay preguntas repetidas.')
  for (const [i, q] of qs.entries()) {
    const opts = q.opciones.map((o) => o.trim().toLowerCase())
    if (new Set(opts).size !== opts.length) errors.push(`questions[${i}]: opciones repetidas.`)
    if (opts.some((o) => o.startsWith('no lo sé') || o.startsWith('no lo se') || o === 'no sé')) errors.push(`questions[${i}]: no incluyas "No lo sé" (lo añade la app).`)
  }
  return errors
}

// ─── Petición ──────────────────────────────────────────────────────────────

/** JPEG en base64 sin cabecera data:… (empieza por /9j/, los bytes FF D8 FF). */
const jpegBase64 = z
  .string()
  .min(100)
  .regex(/^\/9j\/[A-Za-z0-9+/]+={0,2}$/, 'La imagen debe ser un JPEG en base64')

export const FoodEstimateRequestSchema = z
  .object({
    description: z.string().max(FOOD_DESCRIPTION_MAX).optional(),
    image: jpegBase64.optional(),
    previousQuestions: z.array(AskedQuestionSchema).max(MAX_QUESTIONS_PER_ROUND * MAX_QUESTION_ROUNDS).optional(),
    answers: z.array(AnswerSchema).max(MAX_QUESTIONS_PER_ROUND * MAX_QUESTION_ROUNDS).optional(),
  })
  .refine((r) => Boolean(r.description?.trim()) || Boolean(r.image), { message: 'Falta la descripción o la foto' })
  .refine((r) => roundsAsked(r.previousQuestions) <= MAX_QUESTION_ROUNDS, { message: 'Demasiadas tandas de preguntas' })
export type FoodEstimateRequest = z.infer<typeof FoodEstimateRequestSchema>

// ─── Estimación ────────────────────────────────────────────────────────────

export const CONFIDENCE_LEVELS = ['alta', 'media', 'baja'] as const
export type Confidence = (typeof CONFIDENCE_LEVELS)[number]

const nonNeg = (max: number) => z.number().min(0).max(max)

export const EstimateItemSchema = z.object({
  nombre: z.string().min(1).max(80).describe('Nombre del alimento en español, concreto (p. ej. "Arroz blanco cocido")'),
  gramos: z.number().gt(0).max(3000).describe('Gramos estimados de la porción'),
  kcal: nonNeg(5000).describe('kcal de esa porción'),
  proteina: nonNeg(500).describe('Proteína (g) de esa porción'),
  carbohidratos: nonNeg(800).describe('Carbohidratos (g) de esa porción'),
  grasa: nonNeg(400).describe('Grasa (g) de esa porción, incluido el aceite o la salsa probables'),
  confianza: z.enum(CONFIDENCE_LEVELS).describe('Confianza en la identificación y la cantidad'),
  supuesto: z.string().max(200).describe('Breve: lo que has supuesto (cantidad, aceite, salsa, versión del producto) o cadena vacía'),
})
export type EstimateItem = z.infer<typeof EstimateItemSchema>

const totalsSchema = z.object({ kcal: nonNeg(20000), proteina: nonNeg(2000), carbohidratos: nonNeg(3000), grasa: nonNeg(1500) })

export const EstimateToolSchema = z.object({
  reconocida: z.boolean().describe('false si no es comida o no se distingue qué es'),
  items: z.array(EstimateItemSchema).max(FOOD_ESTIMATE_MAX_ITEMS).describe('Un elemento por alimento; vacío si no reconocida'),
  totales: totalsSchema.describe('Suma de los items'),
  comentario: z.string().max(400).describe('1-2 frases en español: qué has estimado y los supuestos principales, o por qué no se puede estimar'),
})
export type EstimateToolInput = z.infer<typeof EstimateToolSchema>

export type FoodEstimate = { type: 'estimate' } & EstimateToolInput
export interface FoodQuestions {
  type: 'questions'
  questions: AskedQuestion[]
}

export interface FoodEstimateResponse {
  result: FoodEstimate | FoodQuestions
  model: string
}

/**
 * Reglas de la estimación que el esquema no expresa (vacío = válida): reconocida sin
 * alimentos, kcal incoherentes con los macros (4/4/9) o densidad imposible.
 */
export function estimateErrors(e: EstimateToolInput): string[] {
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
export function sumEstimate(items: readonly EstimateItem[]): EstimateToolInput['totales'] {
  const t = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, proteina: a.proteina + i.proteina, carbohidratos: a.carbohidratos + i.carbohidratos, grasa: a.grasa + i.grasa }), { kcal: 0, proteina: 0, carbohidratos: 0, grasa: 0 })
  const r = (n: number) => Math.round(n * 10) / 10
  return { kcal: Math.round(t.kcal), proteina: r(t.proteina), carbohidratos: r(t.carbohidratos), grasa: r(t.grasa) }
}

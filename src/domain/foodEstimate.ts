/**
 * Flujo de estimación con IA en la app (texto, foto o ambos, con preguntas de aclaración):
 * validación de la entrada, tandas de preguntas con sus respuestas y la petición a
 * /api/food-estimate. Todo puro.
 */
import type { Food } from './types'
import { DONT_KNOW, FOOD_DESCRIPTION_MAX, type AskedQuestion, type FoodEstimateRequest } from './foodEstimateSchema'

/** Una tanda de preguntas y lo que ha elegido el usuario (id de pregunta → opción). */
export interface QuestionRound {
  questions: AskedQuestion[]
  answers: Readonly<Record<string, string>>
}

/** Error comprensible si no hay nada que estimar; null si se puede enviar. */
export function validateEstimateInput(description: string, hasImage: boolean): string | null {
  if (!description.trim() && !hasImage) return 'Escribe qué has comido o añade una foto.'
  if (description.length > FOOD_DESCRIPTION_MAX) return `Máximo ${FOOD_DESCRIPTION_MAX} caracteres.`
  return null
}

/** Opciones que se muestran: las de la IA + "No lo sé". */
export const answerOptions = (q: Pick<AskedQuestion, 'opciones'>): string[] => [...q.opciones, DONT_KNOW]

/** Elige una opción (volver a tocarla la quita). */
export function selectAnswer(round: QuestionRound, questionId: string, answer: string): QuestionRound {
  const answers = { ...round.answers }
  if (answers[questionId] === answer) delete answers[questionId]
  else answers[questionId] = answer
  return { ...round, answers }
}

export const addRound = (rounds: readonly QuestionRound[], questions: AskedQuestion[]): QuestionRound[] => [...rounds, { questions, answers: {} }]

/**
 * Petición a /api/food-estimate: descripción (si hay), foto (si hay) y todas las preguntas
 * hechas con su respuesta; las que el usuario no contestó cuentan como "No lo sé".
 */
export function buildEstimateRequest(input: { description: string; image?: string; rounds: readonly QuestionRound[] }): FoodEstimateRequest {
  const description = input.description.trim()
  const questions = input.rounds.flatMap((r) => r.questions)
  const answers = input.rounds.flatMap((r) => r.questions.map((q) => ({ questionId: q.id, answer: r.answers[q.id] ?? DONT_KNOW })))
  return {
    ...(description ? { description } : {}),
    ...(input.image ? { image: input.image } : {}),
    ...(questions.length ? { previousQuestions: questions, answers } : {}),
  }
}

/** Origen con el que se guardan los alimentos estimados. */
export const estimateSource = (hasImage: boolean): Extract<Food['source'], 'ia-foto' | 'ia-texto'> => (hasImage ? 'ia-foto' : 'ia-texto')

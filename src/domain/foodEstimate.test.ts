import { describe, expect, it } from 'vitest'
import { FoodEstimateRequestSchema } from './foodEstimateSchema'
import { addRound, answerOptions, buildEstimateRequest, estimateSource, selectAnswer, validateEstimateInput, type QuestionRound } from './foodEstimate'

const q1 = { id: 'r1q1', texto: '¿Qué cantidad?', opciones: ['Pequeña (~200 g)', 'Normal (~300 g)'] }
const q2 = { id: 'r1q2', texto: '¿Frito o a la plancha?', opciones: ['Frito', 'Plancha'] }
const q3 = { id: 'r2q1', texto: '¿Con qué salsa?', opciones: ['Tomate', 'Nata'] }

describe('entrada', () => {
  it('descripción vacía sin foto → error comprensible; con foto vale', () => {
    expect(validateEstimateInput('  ', false)).toBe('Escribe qué has comido o añade una foto.')
    expect(validateEstimateInput('', true)).toBeNull()
    expect(validateEstimateInput('un yogur', false)).toBeNull()
    expect(validateEstimateInput('x'.repeat(1001), false)).toContain('1000')
  })
})

describe('preguntas', () => {
  it('opciones + "No lo sé"', () => {
    expect(answerOptions(q1)).toEqual(['Pequeña (~200 g)', 'Normal (~300 g)', 'No lo sé'])
  })

  it('elegir, cambiar y quitar respuesta', () => {
    let r: QuestionRound = { questions: [q1, q2], answers: {} }
    r = selectAnswer(r, 'r1q1', 'Normal (~300 g)')
    r = selectAnswer(r, 'r1q2', 'Frito')
    r = selectAnswer(r, 'r1q2', 'Plancha')
    expect(r.answers).toEqual({ r1q1: 'Normal (~300 g)', r1q2: 'Plancha' })
    expect(selectAnswer(r, 'r1q1', 'Normal (~300 g)').answers).toEqual({ r1q2: 'Plancha' })
  })
})

describe('buildEstimateRequest', () => {
  it('solo texto (recortado)', () => {
    expect(buildEstimateRequest({ description: ' un yogur natural ', rounds: [] })).toEqual({ description: 'un yogur natural' })
  })

  it('foto sin texto, o ambos', () => {
    expect(buildEstimateRequest({ description: '', image: '/9j/AAA', rounds: [] })).toEqual({ image: '/9j/AAA' })
    expect(buildEstimateRequest({ description: 'con queso', image: '/9j/AAA', rounds: [] })).toEqual({ description: 'con queso', image: '/9j/AAA' })
  })

  it('todas las tandas con sus respuestas; sin contestar → "No lo sé"; válida para el servidor', () => {
    let rounds = addRound([], [q1, q2])
    rounds = [selectAnswer(rounds[0]!, 'r1q1', 'Normal (~300 g)')]
    rounds = addRound(rounds, [q3])
    const req = buildEstimateRequest({ description: 'macarrones', rounds })
    expect(req.previousQuestions).toEqual([q1, q2, q3])
    expect(req.answers).toEqual([
      { questionId: 'r1q1', answer: 'Normal (~300 g)' },
      { questionId: 'r1q2', answer: 'No lo sé' },
      { questionId: 'r2q1', answer: 'No lo sé' },
    ])
    expect(FoodEstimateRequestSchema.safeParse({ ...req, image: undefined }).success).toBe(true)
  })
})

it('origen al guardar', () => {
  expect(estimateSource(true)).toBe('ia-foto')
  expect(estimateSource(false)).toBe('ia-texto')
})

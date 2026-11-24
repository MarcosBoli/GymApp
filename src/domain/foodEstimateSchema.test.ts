import { describe, expect, it } from 'vitest'
import {
  EstimateToolSchema,
  FoodEstimateRequestSchema,
  QuestionsToolSchema,
  estimateErrors,
  questionErrors,
  questionRound,
  roundsAsked,
  sumEstimate,
  type EstimateItem,
  type EstimateToolInput,
} from './foodEstimateSchema'

const item = (over: Partial<EstimateItem> = {}): EstimateItem => ({
  nombre: 'Arroz blanco cocido',
  gramos: 150,
  kcal: 195,
  proteina: 4,
  carbohidratos: 42,
  grasa: 0.5,
  confianza: 'alta',
  supuesto: '',
  ...over,
})
const estimate = (items: EstimateItem[], reconocida = true): EstimateToolInput => ({ reconocida, items, totales: sumEstimate(items), comentario: 'Plato de arroz.' })
const q = (id: string) => ({ id, texto: '¿Qué cantidad?', opciones: ['Pequeña (~150 g)', 'Normal (~250 g)'] })

describe('petición', () => {
  const jpeg = '/9j/' + 'A'.repeat(200)
  it('texto, foto o ambos', () => {
    expect(FoodEstimateRequestSchema.safeParse({ description: 'un yogur natural' }).success).toBe(true)
    expect(FoodEstimateRequestSchema.safeParse({ image: jpeg }).success).toBe(true)
    expect(FoodEstimateRequestSchema.safeParse({ image: jpeg, description: 'con aceite' }).success).toBe(true)
  })

  it('con preguntas ya hechas y respuestas', () => {
    const r = FoodEstimateRequestSchema.safeParse({ description: 'macarrones', previousQuestions: [q('r1q1')], answers: [{ questionId: 'r1q1', answer: 'No lo sé' }] })
    expect(r.success).toBe(true)
  })

  it.each([
    [{}],
    [{ description: '   ' }], // descripción vacía y sin foto
    [{ description: 'x'.repeat(1001) }],
    [{ image: 'iVBORw0KGgo' + 'A'.repeat(200) }], // PNG
    [{ image: 'data:image/jpeg;base64,/9j/' + 'A'.repeat(200) }],
    [{ description: 'a', previousQuestions: [q('racion')] }], // id no asignado por el servidor
    [{ description: 'a', previousQuestions: [q('r3q1')] }], // más de 2 tandas
    [{ description: 'a', answers: [{ questionId: 'r1q1', answer: '' }] }],
  ])('rechaza %#', (body) => {
    expect(FoodEstimateRequestSchema.safeParse(body).success).toBe(false)
  })
})

describe('tandas de preguntas', () => {
  it('tanda por id y tandas hechas', () => {
    expect(questionRound('r2q3')).toBe(2)
    expect(roundsAsked([])).toBe(0)
    expect(roundsAsked(undefined)).toBe(0)
    expect(roundsAsked([q('r1q1'), q('r1q2'), q('r2q1')])).toBe(2)
  })

  it('máximo 3 preguntas y 2-4 opciones', () => {
    expect(QuestionsToolSchema.safeParse({ questions: [q('a'), q('b'), q('c')] }).success).toBe(true)
    expect(QuestionsToolSchema.safeParse({ questions: [q('a'), q('b'), q('c'), q('d')] }).success).toBe(false)
    expect(QuestionsToolSchema.safeParse({ questions: [] }).success).toBe(false)
    expect(QuestionsToolSchema.safeParse({ questions: [{ ...q('a'), opciones: ['Sí'] }] }).success).toBe(false)
    expect(QuestionsToolSchema.safeParse({ questions: [{ ...q('a'), opciones: ['a', 'b', 'c', 'd', 'e'] }] }).success).toBe(false)
  })

  it('reglas: sin repetidas y sin "No lo sé" (lo añade la app)', () => {
    expect(questionErrors([q('a')])).toEqual([])
    expect(questionErrors([q('a'), q('b')])).toEqual(['Hay preguntas repetidas.'])
    expect(questionErrors([{ ...q('a'), opciones: ['Frito', 'frito'] }])[0]).toContain('opciones repetidas')
    expect(questionErrors([{ ...q('a'), opciones: ['Plancha', 'No lo sé'] }])[0]).toContain('No lo sé')
  })
})

describe('estimación', () => {
  it('válida sin errores; no reconocida sin items también', () => {
    const e = estimate([item(), item({ nombre: 'Pechuga de pollo a la plancha', gramos: 120, kcal: 198, proteina: 37, carbohidratos: 0, grasa: 5.5 })])
    expect(EstimateToolSchema.safeParse(e).success).toBe(true)
    expect(estimateErrors(e)).toEqual([])
    expect(estimateErrors(estimate([], false))).toEqual([])
  })

  it('detecta incoherencias', () => {
    expect(estimateErrors(estimate([]))).toHaveLength(1)
    expect(estimateErrors(estimate([item({ kcal: 600 })]))[0]).toContain('no cuadra con los macros')
    expect(estimateErrors(estimate([item({ gramos: 10, kcal: 120, proteina: 0, carbohidratos: 0, grasa: 13 })])).join()).toContain('950 kcal')
    expect(estimateErrors(estimate([item({ gramos: 20 })])).join()).toContain('pesan más que los gramos')
  })

  it('esquema: confianza cerrada, gramos > 0, supuesto obligatorio', () => {
    expect(EstimateToolSchema.safeParse(estimate([item({ confianza: 'segura' as 'alta' })])).success).toBe(false)
    expect(EstimateToolSchema.safeParse(estimate([item({ gramos: 0 })])).success).toBe(false)
    const { supuesto: _s, ...sinSupuesto } = item()
    expect(EstimateToolSchema.safeParse({ ...estimate([]), items: [sinSupuesto] }).success).toBe(false)
  })

  it('sumEstimate redondea', () => {
    expect(sumEstimate([item(), item({ kcal: 100.4, proteina: 1.04 })])).toEqual({ kcal: 295, proteina: 5, carbohidratos: 84, grasa: 1 })
  })
})

import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { buildEstimatePrompt, estimateFood, ESTIMATE_TOOL, FOOD_SYSTEM, QUESTIONS_TOOL } from './foodEstimate.js'
import { createAiHandlers, SECRET_HEADER } from './handlers.js'
import type { AiClient } from './claude.js'
import { AI_ERROR_MESSAGES } from '../../src/domain/aiErrors.js'
import { FOOD_ESTIMATE_MAX_BODY_BYTES, type EstimateItem, type EstimateToolInput, type FoodEstimateRequest } from '../../src/domain/foodEstimateSchema.js'

const IMAGE = '/9j/' + 'A'.repeat(400)
const chicken: EstimateItem = { nombre: 'Pechuga de pollo a la plancha', gramos: 200, kcal: 330, proteina: 62, carbohidratos: 0, grasa: 9, confianza: 'alta', supuesto: 'incluye ~1 cucharadita de aceite' }
const macaroni: EstimateItem = { nombre: 'Macarrones con tomate y queso', gramos: 300, kcal: 480, proteina: 17, carbohidratos: 75, grasa: 12, confianza: 'media', supuesto: 'ración normal (~300 g)' }
// Totales del modelo mal sumados a propósito: se recalculan
const estimate = (items: EstimateItem[] = [chicken]): EstimateToolInput => ({ reconocida: true, items, totales: { kcal: 1, proteina: 1, carbohidratos: 1, grasa: 1 }, comentario: 'Estimación.' })
const questions = {
  questions: [
    { id: 'racion', texto: '¿Qué cantidad de macarrones?', opciones: ['Pequeña (~200 g)', 'Normal (~300 g)', 'Grande (~400 g)'] },
    { id: 'queso', texto: '¿Cuánto queso?', opciones: ['Un poco', 'Bastante'] },
  ],
}

type Reply = { tool?: string; input?: unknown; stop_reason?: string; noTool?: boolean }
function client(...replies: Reply[]) {
  const create = vi.fn(async () => {
    const r = replies.shift()!
    return {
      model: 'claude-sonnet-5-5',
      stop_reason: r.stop_reason ?? 'tool_use',
      content: r.noTool
        ? [{ type: 'text', text: 'Veo macarrones.' }]
        : [
            { type: 'thinking', thinking: '', signature: 'sig' }, // Sonnet 5.5 razona antes de llamar
            { type: 'tool_use', id: 'tu_1', name: r.tool ?? ESTIMATE_TOOL, input: r.input },
          ],
      usage: { input_tokens: 800, output_tokens: 200 },
    }
  })
  return { client: { beta: { messages: { create } }, models: { retrieve: vi.fn() } } as unknown as AiClient, create }
}
type Params = {
  model: string
  max_tokens: number
  system: string
  messages: { content: { type: string; text?: string; source?: { data: string; media_type: string } }[] }[]
  tools: { name: string; input_schema: Record<string, unknown> }[]
  tool_choice?: { type: string }
  output_config?: { effort: string }
  fallbacks?: string
}
const params = (create: ReturnType<typeof vi.fn>, i = 0) => create.mock.calls[i] as unknown as [Params, { timeout: number; maxRetries: number }]
const deadline = () => Date.now() + 57_000
const run = (c: AiClient, req: FoodEstimateRequest, model = 'claude-sonnet-5-5') => estimateFood(c, model, req, { deadline: deadline() })

describe('estimateFood', () => {
  it('descripción suficiente → estimación directa (texto, sin imagen)', async () => {
    const { client: c, create } = client({ input: estimate() })
    const r = await run(c, { description: '200 g de pechuga a la plancha' })
    expect(r.result).toMatchObject({ type: 'estimate', reconocida: true, items: [chicken], totales: { kcal: 330, proteina: 62, carbohidratos: 0, grasa: 9 } })
    expect(r.attempts).toBe(1)
    const [p, o] = params(create)
    expect(p.messages[0]!.content).toHaveLength(1) // sin imagen
    expect(p.messages[0]!.content[0]!.text).toContain('Lo que ha comido el usuario: 200 g de pechuga a la plancha')
    expect(p.tools.map((t) => t.name)).toEqual([ESTIMATE_TOOL, QUESTIONS_TOOL])
    expect(p.tool_choice === undefined || p.tool_choice.type === 'auto').toBe(true) // nunca forzado (400 en Sonnet 5.5)
    expect(p).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 8000, output_config: { effort: 'medium' }, fallbacks: 'default' })
    for (const t of p.tools) {
      expect(t.input_schema).toMatchObject({ type: 'object' })
      expect(t.input_schema).not.toHaveProperty('$schema')
    }
    expect(JSON.stringify(p.tools[0]!.input_schema)).toContain('"supuesto"')
    expect(o.maxRetries).toBe(0)
  })

  it('ronda de preguntas: ids r1q1… asignados por el servidor', async () => {
    const r = await run(client({ tool: QUESTIONS_TOOL, input: questions }).client, { description: 'macarrones con tomate y queso' })
    expect(r.result).toEqual({
      type: 'questions',
      questions: [
        { id: 'r1q1', texto: '¿Qué cantidad de macarrones?', opciones: ['Pequeña (~200 g)', 'Normal (~300 g)', 'Grande (~400 g)'] },
        { id: 'r1q2', texto: '¿Cuánto queso?', opciones: ['Un poco', 'Bastante'] },
      ],
    })
  })

  it('respuestas (incluido "No lo sé") en el prompt; segunda tanda posible y con ids r2…', async () => {
    const previousQuestions = [
      { id: 'r1q1', texto: '¿Qué cantidad de macarrones?', opciones: ['Pequeña (~200 g)', 'Normal (~300 g)'] },
      { id: 'r1q2', texto: '¿Cuánto queso?', opciones: ['Un poco', 'Bastante'] },
    ]
    const req = { description: 'macarrones con tomate y queso', previousQuestions, answers: [{ questionId: 'r1q1', answer: 'Normal (~300 g)' }, { questionId: 'r1q2', answer: 'No lo sé' }] }
    const prompt = buildEstimatePrompt(req)
    expect(prompt).toContain('- ¿Qué cantidad de macarrones? → Normal (~300 g)')
    expect(prompt).toContain('- ¿Cuánto queso? → No lo sé')
    expect(prompt).toContain('última tanda')
    expect(FOOD_SYSTEM).toContain('Si una respuesta es "No lo sé", asume lo más habitual en España')

    const { client: c, create } = client({ tool: QUESTIONS_TOOL, input: { questions: [{ id: 'x', texto: '¿Con qué salsa?', opciones: ['Tomate frito', 'Tomate natural'] }] } })
    const r = await run(c, req)
    expect(params(create)[0].tools.map((t) => t.name)).toContain(QUESTIONS_TOOL)
    expect(r.result).toMatchObject({ type: 'questions', questions: [{ id: 'r2q1' }] })
  })

  it('respuesta sin contestar cuenta como "No lo sé"', () => {
    const prompt = buildEstimatePrompt({ description: 'x', previousQuestions: [{ id: 'r1q1', texto: '¿Frito o plancha?', opciones: ['Frito', 'Plancha'] }] })
    expect(prompt).toContain('¿Frito o plancha? → No lo sé')
  })

  it('límite de rondas: tras 2 tandas ya no se ofrece la herramienta de preguntas y debe estimar', async () => {
    const previousQuestions = [
      { id: 'r1q1', texto: '¿Qué cantidad?', opciones: ['Poca', 'Mucha'] },
      { id: 'r2q1', texto: '¿Con qué salsa?', opciones: ['Tomate', 'Nata'] },
    ]
    const { client: c, create } = client({ input: estimate([macaroni]) })
    const r = await run(c, { description: 'macarrones', previousQuestions, answers: [{ questionId: 'r1q1', answer: 'No lo sé' }] })
    const [p] = params(create)
    expect(p.tools.map((t) => t.name)).toEqual([ESTIMATE_TOOL])
    expect(p.messages[0]!.content.at(-1)!.text).toContain('Ya no puedes preguntar más')
    expect(r.result.type).toBe('estimate')
  })

  it('límite de rondas: si aun así pregunta, cuenta como error y reintenta', async () => {
    const previousQuestions = [{ id: 'r1q1', texto: 'a?', opciones: ['a', 'b'] }, { id: 'r2q1', texto: 'b?', opciones: ['a', 'b'] }]
    const { client: c, create } = client({ tool: QUESTIONS_TOOL, input: questions }, { input: estimate([macaroni]) })
    const r = await run(c, { description: 'macarrones', previousQuestions })
    expect(r).toMatchObject({ attempts: 2, result: { type: 'estimate' } })
    expect(params(create, 1)[0].messages[0]!.content.at(-1)!.text).toContain(`No llamaste a la herramienta ${ESTIMATE_TOOL}`)
  })

  it('foto + texto: imagen primero y el texto como nota', async () => {
    const { client: c, create } = client({ input: estimate([macaroni]) })
    await run(c, { image: IMAGE, description: 'con mucho queso' })
    const content = params(create)[0].messages[0]!.content
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMAGE } })
    expect(content[1]!.text).toContain('Nota del usuario sobre la foto: con mucho queso')
  })

  it('solo foto', () => {
    expect(buildEstimatePrompt({ image: IMAGE })).toContain('Estima lo que hay en esta foto.')
  })

  it('no es comida: estimación con reconocida false, sin error', async () => {
    const notFood = { reconocida: false, items: [], totales: { kcal: 0, proteina: 0, carbohidratos: 0, grasa: 0 }, comentario: 'Eso no es comida.' }
    const r = await run(client({ input: notFood }).client, { description: 'mi coche' })
    expect(r.result).toMatchObject({ type: 'estimate', reconocida: false, comentario: 'Eso no es comida.' })
  })

  it('el system prompt cubre las reglas pedidas', () => {
    for (const s of ['más de un 20 %', 'frito / plancha / horno', 'normal / light / entero / desnatado', '200 g de pechuga a la plancha', 'Como mucho 3 preguntas', 'segunda tanda', 'medidas caseras españolas', 'BEDCA', 'tortilla de patatas', 'menú del día', 'Hacendado', 'No inventes alimentos', 'supuesto']) {
      expect(FOOD_SYSTEM).toContain(s)
    }
  })

  it.each([
    ['estimación incoherente', { input: estimate([{ ...chicken, kcal: 900 }]) }, 'no cuadra con los macros'],
    ['preguntas con "No lo sé"', { tool: QUESTIONS_TOOL, input: { questions: [{ id: 'a', texto: '¿Frito?', opciones: ['Sí', 'No lo sé'] }] } }, 'No lo sé'],
    ['más de 3 preguntas', { tool: QUESTIONS_TOOL, input: { questions: [1, 2, 3, 4].map((i) => ({ id: `q${i}`, texto: `¿Pregunta ${i}?`, opciones: ['a', 'b'] })) } }, 'questions'],
    ['sin herramienta', { noTool: true }, 'No llamaste a la herramienta'],
    ['cortada por longitud', { input: estimate(), stop_reason: 'max_tokens' }, 'se cortó por longitud'],
  ])('%s → reintenta una vez con los errores', async (_, first, expected) => {
    const { client: c, create } = client(first as Reply, { input: estimate() })
    const r = await run(c, { description: 'pollo' })
    expect(r.attempts).toBe(2)
    expect(params(create, 1)[0].messages[0]!.content.at(-1)!.text).toContain(expected)
  })

  it('dos fallos → invalid_estimate; negativa → refused', async () => {
    const bad = { input: estimate([{ ...chicken, kcal: 900 }]) }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(run(client(bad, bad).client, { description: 'pollo' })).rejects.toMatchObject({ code: 'invalid_estimate', status: 502 })
    spy.mockRestore()
    await expect(run(client({ input: estimate(), stop_reason: 'refusal' }).client, { description: 'pollo' })).rejects.toMatchObject({ code: 'refused' })
  })

  it('sin tiempo para el reintento → no lo intenta', async () => {
    let t = 0
    const { client: c, create } = client({ noTool: true }, { input: estimate() })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(estimateFood(c, 'claude-sonnet-5-5', { description: 'pollo' }, { deadline: 50_000, now: () => (t += 40_000) })).rejects.toMatchObject({ code: 'invalid_estimate' })
    spy.mockRestore()
    expect(create).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/food-estimate', () => {
  const ENV = { ANTHROPIC_API_KEY: 'sk-test', APP_SECRET: 's3cr3t' }
  const post = (body: unknown, headers: Record<string, string> = { [SECRET_HEADER]: 's3cr3t' }) =>
    new Request('https://app.test/api/food-estimate', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  const errorOf = async (res: Response) => ((await res.json()) as { error: { code: string; message: string } }).error

  it('FOOD_MODEL por defecto y configurable', async () => {
    const a = client({ input: estimate() })
    const res = await createAiHandlers({ env: ENV, makeClient: () => a.client }).foodEstimate(post({ description: 'pollo' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ result: { type: 'estimate' }, model: 'claude-sonnet-5-5' })
    const b = client({ input: estimate() })
    await createAiHandlers({ env: { ...ENV, FOOD_MODEL: 'claude-haiku-5-5' }, makeClient: () => b.client }).foodEstimate(post({ description: 'pollo' }))
    expect(params(b.create)[0].model).toBe('claude-haiku-5-5')
  })

  it('secreto incorrecto → 401 sin llamar a Claude', async () => {
    const { client: c, create } = client()
    const res = await createAiHandlers({ env: ENV, makeClient: () => c }).foodEstimate(post({ description: 'pollo' }, { [SECRET_HEADER]: 'x' }))
    expect(res.status).toBe(401)
    expect(create).not.toHaveBeenCalled()
  })

  it.each([[{}], [{ description: '  ' }], [{ image: 'hola' }]])('petición vacía o imagen no JPEG → 400 (%o)', async (body) => {
    const res = await createAiHandlers({ env: ENV, makeClient: () => client().client }).foodEstimate(post(body))
    expect(res.status).toBe(400)
    expect((await errorOf(res)).code).toBe('invalid_request')
  })

  it('fotos por encima de 64 KB pero no de su propio límite', async () => {
    const ok = await createAiHandlers({ env: ENV, makeClient: () => client({ input: estimate() }).client }).foodEstimate(post({ image: '/9j/' + 'A'.repeat(500_000) }))
    expect(ok.status).toBe(200)
    const res = await createAiHandlers({ env: ENV, makeClient: () => client().client }).foodEstimate(post({ image: '/9j/' + 'A'.repeat(FOOD_ESTIMATE_MAX_BODY_BYTES) }))
    expect(res.status).toBe(413)
  })

  it('sin saldo → 402 con su mensaje', async () => {
    const noCredit = Anthropic.APIError.generate(402, { type: 'error', error: { type: 'billing_error', message: 'x' } }, undefined, new Headers())
    const c = { beta: { messages: { create: vi.fn(async () => { throw noCredit }) } }, models: { retrieve: vi.fn() } } as unknown as AiClient
    const res = await createAiHandlers({ env: ENV, makeClient: () => c }).foodEstimate(post({ description: 'pollo' }))
    expect(res.status).toBe(402)
    expect(await errorOf(res)).toEqual({ code: 'no_credit', message: AI_ERROR_MESSAGES.no_credit })
  })
})

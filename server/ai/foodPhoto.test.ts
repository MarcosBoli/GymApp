import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { estimateFoodPhoto, FOOD_SYSTEM, FOOD_TOOL_NAME } from './foodPhoto.js'
import { createAiHandlers, SECRET_HEADER } from './handlers.js'
import type { AiClient } from './claude.js'
import { AI_ERROR_MESSAGES } from '../../src/domain/aiErrors.js'
import { FOOD_PHOTO_MAX_BODY_BYTES, type FoodPhotoEstimate, type FoodPhotoItem } from '../../src/domain/foodPhotoSchema.js'

const IMAGE = '/9j/' + 'A'.repeat(400)
const rice: FoodPhotoItem = { nombre: 'Arroz blanco cocido', gramos: 150, kcal: 195, proteina: 4, carbohidratos: 42, grasa: 0.5, confianza: 'alta', nota: '' }
const chicken: FoodPhotoItem = { nombre: 'Pechuga de pollo a la plancha', gramos: 120, kcal: 223, proteina: 37, carbohidratos: 0, grasa: 8, confianza: 'media', nota: 'incluye ~1 cucharadita de aceite' }
// Totales del modelo mal sumados a propósito: la app los recalcula
const valid: FoodPhotoEstimate = { reconocida: true, items: [rice, chicken], totales: { kcal: 999, proteina: 1, carbohidratos: 1, grasa: 1 }, comentario: 'Arroz con pollo a la plancha.' }

type Reply = { input?: unknown; stop_reason?: string; noTool?: boolean }
function client(...replies: Reply[]) {
  const create = vi.fn(async () => {
    const r = replies.shift()!
    return {
      model: 'claude-sonnet-5-5',
      stop_reason: r.stop_reason ?? 'tool_use',
      content: r.noTool ? [{ type: 'text', text: 'Veo arroz.' }] : [{ type: 'tool_use', id: 'tu_1', name: FOOD_TOOL_NAME, input: r.input }],
      usage: { input_tokens: 1200, output_tokens: 300 },
    }
  })
  return { client: { beta: { messages: { create } }, models: { retrieve: vi.fn(async (id: string) => ({ id })) } } as unknown as AiClient, create }
}
type Params = {
  model: string
  max_tokens: number
  system: string
  messages: { role: string; content: { type: string; text?: string; source?: { type: string; media_type: string; data: string } }[] }[]
  tools: { name: string; input_schema: Record<string, unknown> }[]
  tool_choice: { type: string; name: string }
  output_config?: { effort: string }
  fallbacks?: string
}
const params = (create: ReturnType<typeof vi.fn>, i = 0) => create.mock.calls[i] as unknown as [Params, { timeout: number; maxRetries: number }]
const deadline = () => Date.now() + 57_000

describe('estimateFoodPhoto', () => {
  it('estimación válida al primer intento con tool use forzado e imagen JPEG', async () => {
    const { client: c, create } = client({ input: valid })
    const r = await estimateFoodPhoto(c, 'claude-sonnet-5-5', { image: IMAGE, note: ' sin aceite en el arroz ' }, { deadline: deadline() })
    expect(r.attempts).toBe(1)
    expect(r.estimate.items).toEqual([rice, chicken])
    expect(r.estimate.totales).toEqual({ kcal: 418, proteina: 41, carbohidratos: 42, grasa: 8.5 })
    expect(r.usage).toEqual({ input_tokens: 1200, output_tokens: 300 })

    const [p, o] = params(create)
    expect(p.tool_choice).toEqual({ type: 'tool', name: FOOD_TOOL_NAME })
    expect(p.tools[0]!.name).toBe(FOOD_TOOL_NAME)
    const schema = JSON.stringify(p.tools[0]!.input_schema)
    for (const k of ['nombre', 'gramos', 'kcal', 'proteina', 'carbohidratos', 'grasa', 'confianza', 'nota', 'totales', 'comentario']) expect(schema).toContain(`"${k}"`)
    expect(schema).toContain('"enum":["alta","media","baja"]')
    expect(p.messages[0]!.content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMAGE } })
    expect(p.messages[0]!.content[1]!.text).toBe('Nota del usuario: sin aceite en el arroz')
    expect(p).toMatchObject({ model: 'claude-sonnet-5-5', output_config: { effort: 'medium' }, fallbacks: 'default' })
    expect(o.maxRetries).toBe(0)
    expect(o.timeout).toBeLessThanOrEqual(45_000)
  })

  it('el system prompt cubre lo pedido', () => {
    for (const s of ['referencias visuales', 'cubiertos', 'mano', 'aceite', 'salsas', 'BEDCA', 'No inventes', 'no es comida']) expect(FOOD_SYSTEM).toContain(s)
  })

  it('sin nota: texto genérico', async () => {
    const { client: c, create } = client({ input: valid })
    await estimateFoodPhoto(c, 'claude-sonnet-5-5', { image: IMAGE }, { deadline: deadline() })
    expect(params(create)[0].messages[0]!.content[1]!.text).toBe('Estima lo que hay en esta foto.')
  })

  it('foto que no es comida: reconocida false, sin error', async () => {
    const notFood = { reconocida: false, items: [], totales: { kcal: 0, proteina: 0, carbohidratos: 0, grasa: 0 }, comentario: 'Es un teclado, no hay comida.' }
    const r = await estimateFoodPhoto(client({ input: notFood }).client, 'claude-sonnet-5-5', { image: IMAGE }, { deadline: deadline() })
    expect(r.estimate).toMatchObject({ reconocida: false, items: [], comentario: 'Es un teclado, no hay comida.' })
  })

  it.each([
    ['no cumple el esquema', { input: { ...valid, items: [{ ...rice, confianza: 'total' }] } }, 'items.0.confianza'],
    ['kcal incoherentes con los macros', { input: { ...valid, items: [{ ...rice, kcal: 700 }] } }, 'no cuadra con los macros'],
    ['no llama a la herramienta', { noTool: true }, 'No llamaste a la herramienta'],
    ['cortada por longitud', { input: valid, stop_reason: 'max_tokens' }, 'se cortó por longitud'],
  ])('%s → reintenta una vez con los errores', async (_, first, expected) => {
    const { client: c, create } = client(first as Reply, { input: valid })
    const r = await estimateFoodPhoto(c, 'claude-sonnet-5-5', { image: IMAGE }, { deadline: deadline() })
    expect(r.attempts).toBe(2)
    const retry = params(create, 1)[0].messages[0]!.content
    expect(retry[0]!.type).toBe('image') // la foto se vuelve a enviar
    expect(retry.at(-1)!.text).toContain(expected)
    expect(r.usage.input_tokens).toBe(2400)
  })

  it('dos fallos → invalid_estimate', async () => {
    const bad = { input: { ...valid, items: [{ ...rice, kcal: 700 }] } }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(estimateFoodPhoto(client(bad, bad).client, 'claude-sonnet-5-5', { image: IMAGE }, { deadline: deadline() })).rejects.toMatchObject({ code: 'invalid_estimate', status: 502 })
    spy.mockRestore()
  })

  it('sin tiempo para el reintento → no lo intenta', async () => {
    let t = 0
    const { client: c, create } = client({ input: { ...valid, items: [{ ...rice, kcal: 700 }] } }, { input: valid })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = estimateFoodPhoto(c, 'claude-sonnet-5-5', { image: IMAGE }, { deadline: 50_000, now: () => (t += 40_000) })
    await expect(run).rejects.toMatchObject({ code: 'invalid_estimate' })
    spy.mockRestore()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('negativa del modelo → refused', async () => {
    await expect(estimateFoodPhoto(client({ input: valid, stop_reason: 'refusal' }).client, 'claude-sonnet-5-5', { image: IMAGE }, { deadline: deadline() })).rejects.toMatchObject({ code: 'refused', status: 422 })
  })

  it('Haiku como FOOD_MODEL: sin fallbacks', async () => {
    const { client: c, create } = client({ input: valid })
    await estimateFoodPhoto(c, 'claude-haiku-5-5', { image: IMAGE }, { deadline: deadline() })
    expect(params(create)[0]).not.toHaveProperty('fallbacks')
  })
})

describe('POST /api/food-photo', () => {
  const ENV = { ANTHROPIC_API_KEY: 'sk-test', APP_SECRET: 's3cr3t' }
  const post = (body: unknown, headers: Record<string, string> = { [SECRET_HEADER]: 's3cr3t' }) =>
    new Request('https://app.test/api/food-photo', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

  it('FOOD_MODEL por defecto y configurable', async () => {
    const a = client({ input: valid })
    const res = await createAiHandlers({ env: ENV, makeClient: () => a.client }).foodPhoto(post({ image: IMAGE }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ estimate: { reconocida: true }, model: 'claude-sonnet-5-5', attempts: 1 })
    expect(params(a.create)[0].model).toBe('claude-sonnet-5-5')

    const b = client({ input: valid })
    await createAiHandlers({ env: { ...ENV, FOOD_MODEL: 'claude-opus-5-5' }, makeClient: () => b.client }).foodPhoto(post({ image: IMAGE }))
    expect(params(b.create)[0].model).toBe('claude-opus-5-5')
  })

  it('secreto incorrecto → 401 sin llamar a Claude', async () => {
    const { client: c, create } = client({ input: valid })
    const res = await createAiHandlers({ env: ENV, makeClient: () => c }).foodPhoto(post({ image: IMAGE }, { [SECRET_HEADER]: 'otro' }))
    expect(res.status).toBe(401)
    expect(create).not.toHaveBeenCalled()
  })

  it('imagen que no es JPEG en base64 → 400', async () => {
    const res = await createAiHandlers({ env: ENV, makeClient: () => client().client }).foodPhoto(post({ image: 'hola' }))
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_request')
  })

  it('admite fotos mayores que el límite general (64 KB) pero no más de su propio límite', async () => {
    const big = '/9j/' + 'A'.repeat(500_000)
    const ok = await createAiHandlers({ env: ENV, makeClient: () => client({ input: valid }).client }).foodPhoto(post({ image: big }))
    expect(ok.status).toBe(200)
    const huge = '/9j/' + 'A'.repeat(FOOD_PHOTO_MAX_BODY_BYTES)
    const res = await createAiHandlers({ env: ENV, makeClient: () => client().client }).foodPhoto(post({ image: huge }))
    expect(res.status).toBe(413)
  })

  it('errores del SDK con su mensaje (sin saldo)', async () => {
    const noCredit = Anthropic.APIError.generate(402, { type: 'error', error: { type: 'billing_error', message: 'x' } }, undefined, new Headers())
    const c = { beta: { messages: { create: vi.fn(async () => { throw noCredit }) } }, models: { retrieve: vi.fn() } } as unknown as AiClient
    const res = await createAiHandlers({ env: ENV, makeClient: () => c }).foodPhoto(post({ image: IMAGE }))
    expect(res.status).toBe(402)
    expect(((await res.json()) as { error: { code: string } }).error).toEqual({ code: 'no_credit', message: AI_ERROR_MESSAGES.no_credit })
  })

  it('dos estimaciones inválidas → 502 invalid_estimate con mensaje', async () => {
    const bad = { input: { ...valid, items: [{ ...rice, kcal: 700 }] } }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await createAiHandlers({ env: ENV, makeClient: () => client(bad, bad).client }).foodPhoto(post({ image: IMAGE }))
    spy.mockRestore()
    expect(res.status).toBe(502)
    expect(((await res.json()) as { error: { code: string } }).error).toEqual({ code: 'invalid_estimate', message: AI_ERROR_MESSAGES.invalid_estimate })
  })
})

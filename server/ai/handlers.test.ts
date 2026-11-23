import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { createAiHandlers, SECRET_HEADER } from './handlers.js'
import { mapAnthropicError, supportsServerFallback, type AiClient } from './claude.js'
import { readAiConfig } from './env.js'
import { secretMatches } from './http.js'
import { validateChatRequest, LIMITS } from './validate.js'
import { AI_ERROR_MESSAGES, AI_MAX_BODY_BYTES, type AiErrorCode } from '../../src/domain/aiErrors.js'

const ENV = { ANTHROPIC_API_KEY: 'sk-test', APP_SECRET: 's3cr3t' }

function fakeClient(reply: Partial<Anthropic.Beta.BetaMessage> | Error = {}) {
  const create = vi.fn(async () => {
    if (reply instanceof Error) throw reply
    return {
      model: 'claude-haiku-5-5',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Hola ' }, { type: 'text', text: 'mundo' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      ...reply,
    }
  })
  const retrieve = vi.fn(async (id: string) => ({ id }))
  const client = { beta: { messages: { create } }, models: { retrieve } } as unknown as AiClient
  return { client, create, retrieve }
}

const post = (path: string, body: unknown, headers: Record<string, string> = { [SECRET_HEADER]: 's3cr3t' }) =>
  new Request(`https://app.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })

async function call(handler: (r: Request) => Promise<Response>, req: Request) {
  const res = await handler(req)
  return { status: res.status, body: (await res.json()) as Record<string, any>, headers: res.headers }
}

const chatBody = { messages: [{ role: 'user', content: '¿Cuántas series hago?' }] }

describe('configuración', () => {
  it('modelos por defecto y configurables', () => {
    expect(readAiConfig(ENV)).toEqual({ ok: true, config: { apiKey: 'sk-test', appSecret: 's3cr3t', planModel: 'claude-sonnet-5-5', chatModel: 'claude-haiku-5-5' } })
    const r = readAiConfig({ ...ENV, PLAN_MODEL: ' claude-opus-5-5 ', CHAT_MODEL: '' })
    expect(r.ok && r.config).toMatchObject({ planModel: 'claude-opus-5-5', chatModel: 'claude-haiku-5-5' })
  })

  it('indica qué falta', () => {
    expect(readAiConfig({ APP_SECRET: ' ' })).toEqual({ ok: false, missing: ['ANTHROPIC_API_KEY', 'APP_SECRET'] })
  })

  it('sin variables → 500 not_configured (sin llamar a Claude)', async () => {
    const { client, create } = fakeClient()
    const h = createAiHandlers({ env: { APP_SECRET: 'x' }, makeClient: () => client })
    const r = await call(h.chat, post('/api/chat', chatBody))
    expect(r.status).toBe(500)
    expect(r.body.error.code).toBe('not_configured')
    expect(create).not.toHaveBeenCalled()
  })
})

describe('protección con x-app-secret', () => {
  it.each([[{}], [{ [SECRET_HEADER]: 'otro' }], [{ [SECRET_HEADER]: '' }]])('secreto ausente o incorrecto → 401 (%o)', async (headers) => {
    const { client, create } = fakeClient()
    const h = createAiHandlers({ env: ENV, makeClient: () => client })
    const r = await call(h.chat, post('/api/chat', chatBody, headers))
    expect(r.status).toBe(401)
    expect(r.body.error).toEqual({ code: 'unauthorized', message: AI_ERROR_MESSAGES.unauthorized })
    expect(create).not.toHaveBeenCalled()
  })

  it('comparación de secretos', () => {
    expect(secretMatches('abc', 'abc')).toBe(true)
    expect(secretMatches('abcd', 'abc')).toBe(false)
    expect(secretMatches(null, 'abc')).toBe(false)
  })

  it('método incorrecto → 405', async () => {
    const h = createAiHandlers({ env: ENV, makeClient: () => fakeClient().client })
    expect((await h.chat(new Request('https://app.test/api/chat'))).status).toBe(405)
    expect((await h.health(post('/api/health', {}))).status).toBe(405)
  })
})

describe('cuerpo de la petición', () => {
  const h = () => createAiHandlers({ env: ENV, makeClient: () => fakeClient().client })

  it('Content-Length por encima del límite → 413', async () => {
    const req = post('/api/chat', chatBody, { [SECRET_HEADER]: 's3cr3t', 'content-length': String(AI_MAX_BODY_BYTES + 1) })
    const r = await call(h().chat, req)
    expect(r.status).toBe(413)
    expect(r.body.error.code).toBe('payload_too_large')
  })

  it('cuerpo real por encima del límite aunque no declare tamaño → 413', async () => {
    const big = JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(AI_MAX_BODY_BYTES) }] })
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close() } })
    const req = new Request('https://app.test/api/chat', { method: 'POST', headers: { [SECRET_HEADER]: 's3cr3t' }, body: stream, duplex: 'half' } as RequestInit)
    expect((await call(h().chat, req)).status).toBe(413)
  })

  it('JSON inválido → 400 invalid_json', async () => {
    const r = await call(h().chat, post('/api/chat', '{"messages": ['))
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('invalid_json')
  })

  it('estructura inválida → 400 invalid_request', async () => {
    const r = await call(h().plan, post('/api/plan', { prompt: 42 }))
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('invalid_request')
  })
})

describe('validación', () => {
  it('chat válido, recorta espacios y contexto opcional', () => {
    expect(validateChatRequest({ messages: [{ role: 'user', content: ' hola ' }], context: '  ' })).toEqual({ messages: [{ role: 'user', content: 'hola' }], context: undefined })
  })

  it.each([
    [{}],
    [{ messages: [] }],
    [{ messages: [{ role: 'assistant', content: 'x' }] }],
    [{ messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] }],
    [{ messages: [{ role: 'system', content: 'x' }] }],
    [{ messages: [{ role: 'user', content: '   ' }] }],
    [{ messages: [{ role: 'user', content: 'x'.repeat(LIMITS.messageChars + 1) }] }],
    [{ messages: Array.from({ length: LIMITS.chatMessages + 1 }, () => ({ role: 'user', content: 'x' })) }],
    [{ messages: [{ role: 'user', content: 'x' }], context: 5 }],
  ])('chat inválido: %o', (body) => {
    expect(() => validateChatRequest(body)).toThrow()
  })

  it('historial demasiado largo en total → 413', () => {
    const messages = Array.from({ length: 9 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(4000) }))
    expect(() => validateChatRequest({ messages })).toThrowError(expect.objectContaining({ code: 'payload_too_large' }))
  })
})

describe('llamadas a Claude', () => {
  it('chat: CHAT_MODEL, effort low, sin fallbacks en Haiku, contexto como bloque de sistema', async () => {
    const { client, create } = fakeClient()
    const h = createAiHandlers({ env: ENV, makeClient: () => client })
    const r = await call(h.chat, post('/api/chat', { ...chatBody, context: 'Pecho: Oro II' }))
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ text: 'Hola mundo', model: 'claude-haiku-5-5', truncated: false, usage: { input_tokens: 10, output_tokens: 5 } })
    expect(r.headers.get('cache-control')).toBe('no-store')
    const [params, options] = create.mock.calls[0] as unknown as [Record<string, any>, Record<string, any>]
    expect(params).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 2000, output_config: { effort: 'low' }, messages: [{ role: 'user', content: '¿Cuántas series hago?' }] })
    expect(params.system[1].text).toContain('Pecho: Oro II')
    expect(params).not.toHaveProperty('fallbacks')
    expect(params).not.toHaveProperty('temperature')
    expect(options).toEqual({ timeout: 25_000, maxRetries: 1 })
  })

  it('modelo configurado por entorno', async () => {
    const { client, create } = fakeClient()
    const h = createAiHandlers({ env: { ...ENV, CHAT_MODEL: 'claude-haiku-4-5' }, makeClient: () => client })
    await h.chat(post('/api/chat', chatBody))
    const [params] = create.mock.calls[0] as unknown as [Record<string, any>]
    expect(params.model).toBe('claude-haiku-4-5')
    expect(params).not.toHaveProperty('output_config') // modelos antiguos sin effort
  })

  it('negativa del modelo → 422 refused', async () => {
    const h = createAiHandlers({ env: ENV, makeClient: () => fakeClient({ stop_reason: 'refusal', content: [] }).client })
    const r = await call(h.chat, post('/api/chat', chatBody))
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('refused')
  })

  it('health: comprueba los dos modelos sin generar texto', async () => {
    const { client, create, retrieve } = fakeClient()
    const h = createAiHandlers({ env: ENV, makeClient: () => client })
    const r = await call(h.health, new Request('https://app.test/api/health', { headers: { [SECRET_HEADER]: 's3cr3t' } }))
    expect(r.body).toEqual({ ok: true, models: { plan: 'claude-sonnet-5-5', chat: 'claude-haiku-5-5' } })
    expect(retrieve.mock.calls.map((c) => c[0])).toEqual(['claude-sonnet-5-5', 'claude-haiku-5-5'])
    expect(create).not.toHaveBeenCalled()
  })

  it('fallbacks solo en modelos que los admiten', () => {
    expect(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-2'].every(supportsServerFallback)).toBe(true)
    expect(['claude-haiku-5-5', 'claude-sonnet-5', 'claude-haiku-4-5'].some(supportsServerFallback)).toBe(false)
  })
})

describe('errores del SDK → mensajes de la app', () => {
  const apiErr = (status: number, type: string, details?: Record<string, string>) =>
    Anthropic.APIError.generate(status, { type: 'error', error: { type, message: 'x', ...(details ? { details } : {}) } }, undefined, new Headers())

  it.each([
    ['sin saldo (402)', apiErr(402, 'billing_error'), 'no_credit', 402],
    ['límite de gasto', new Anthropic.EnforcedSpendLimitReachedError(429, undefined, 'x', new Headers()), 'spend_limit', 402],
    ['límite de contrato', new Anthropic.ContractSpendLimitReachedError(429, undefined, 'x', new Headers()), 'spend_limit', 402],
    ['rate limit', apiErr(429, 'rate_limit_error'), 'rate_limited', 429],
    ['API key mala', apiErr(401, 'authentication_error'), 'ai_auth', 502],
    ['sin permiso', apiErr(403, 'permission_error'), 'ai_auth', 502],
    ['modelo inexistente', apiErr(404, 'not_found_error'), 'model_not_found', 502],
    ['petición rechazada', apiErr(400, 'invalid_request_error'), 'ai_bad_request', 502],
    ['sobrecarga', apiErr(529, 'overloaded_error'), 'ai_unavailable', 503],
    ['error interno', apiErr(500, 'api_error'), 'ai_unavailable', 503],
    ['timeout', new Anthropic.APIConnectionTimeoutError(), 'timeout', 504],
    ['sin conexión', new Anthropic.APIConnectionError({ message: 'x' }), 'ai_unreachable', 502],
    ['demasiado grande', apiErr(413, 'request_too_large'), 'payload_too_large', 413],
    ['cualquier otra cosa', new Error('boom'), 'server_error', 500],
  ] as [string, Error, AiErrorCode, number][])('%s', async (_, err, code, status) => {
    expect(mapAnthropicError(err)).toEqual({ code, status })
    const h = createAiHandlers({ env: ENV, makeClient: () => fakeClient(err).client })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await call(h.chat, post('/api/chat', chatBody))
    spy.mockRestore()
    expect(r.status).toBe(status)
    expect(r.body.error).toEqual({ code, message: AI_ERROR_MESSAGES[code] })
  })
})

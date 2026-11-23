import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamCoachChat } from './aiClient'
import { AI_ERROR_MESSAGES } from '../domain/aiErrors'
import { encodeChatEvent, type ChatStreamEvent } from '../domain/chatStream'

const body = { messages: [{ role: 'user' as const, content: '¿Cómo se hace?' }], context: 'ctx' }

/** Respuesta NDJSON que entrega los trozos dados; `hang` deja el stream abierto hasta abortar. */
function ndjson(chunks: string[], opts: { hang?: boolean } = {}) {
  return (_url: string, init: RequestInit) => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch))
        if (!opts.hang) c.close()
        else init.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')))
      },
    })
    return Promise.resolve(new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } }))
  }
}
const wire = (...events: ChatStreamEvent[]) => events.map(encodeChatEvent).join('')

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => 's3cr3t' })
  vi.stubGlobal('navigator', { onLine: true })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('streamCoachChat', () => {
  it('acumula los trozos (aunque lleguen partidos) y devuelve done', async () => {
    const w = wire({ type: 'delta', text: 'Pies ' }, { type: 'delta', text: 'firmes' }, { type: 'done', model: 'claude-haiku-5-5', truncated: false })
    fetchMock.mockImplementation(ndjson([w.slice(0, 10), w.slice(10, 40), w.slice(40)]))
    const seen: string[] = []
    const r = await streamCoachChat(body, { onText: (t) => seen.push(t) })
    expect(r).toEqual({ text: 'Pies firmes', model: 'claude-haiku-5-5', truncated: false })
    expect(seen.at(-1)).toBe('Pies firmes')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/chat')
    expect((init.headers as Record<string, string>)['x-app-secret']).toBe('s3cr3t')
    expect(JSON.parse(init.body as string)).toEqual(body)
  })

  it('error antes de empezar (JSON nuestro) → mensaje claro', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'no_credit', message: 'x' } }), { status: 402, headers: { 'content-type': 'application/json' } }))
    await expect(streamCoachChat(body, { onText: () => {} })).rejects.toMatchObject({ code: 'no_credit', message: AI_ERROR_MESSAGES.no_credit })
  })

  it('respuestas que no son nuestras: index.html (sin /api) y 504 de Vercel', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    await expect(streamCoachChat(body, { onText: () => {} })).rejects.toMatchObject({ code: 'not_deployed' })
    fetchMock.mockResolvedValueOnce(new Response('An error occurred', { status: 504, headers: { 'content-type': 'text/plain' } }))
    await expect(streamCoachChat(body, { onText: () => {} })).rejects.toMatchObject({ code: 'timeout' })
  })

  it('error a mitad del stream → se lanza (el parcial no vale)', async () => {
    fetchMock.mockImplementation(ndjson([wire({ type: 'delta', text: 'Te ' }, { type: 'error', error: { code: 'refused', message: '' } })]))
    await expect(streamCoachChat(body, { onText: () => {} })).rejects.toMatchObject({ code: 'refused' })
  })

  it('el usuario lo para → devuelve lo recibido como truncado', async () => {
    const stop = new AbortController()
    fetchMock.mockImplementation(ndjson([wire({ type: 'delta', text: 'Primero, ' })], { hang: true }))
    const r = await streamCoachChat(body, {
      signal: stop.signal,
      onText: () => stop.abort(),
    })
    expect(r).toEqual({ text: 'Primero, ', model: null, truncated: true })
  })

  it('se corta sin done (función terminada) → parcial truncado; sin texto → error', async () => {
    fetchMock.mockImplementationOnce(ndjson([wire({ type: 'delta', text: 'Algo' })]))
    expect(await streamCoachChat(body, { onText: () => {} })).toEqual({ text: 'Algo', model: null, truncated: true })
    fetchMock.mockImplementationOnce(ndjson([]))
    await expect(streamCoachChat(body, { onText: () => {} })).rejects.toMatchObject({ code: 'server_error' })
  })

  it('sin secreto o sin conexión: ni lo intenta', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    await expect(streamCoachChat(body, { onText: () => {} })).rejects.toMatchObject({ code: 'missing_secret' })
    vi.stubGlobal('localStorage', { getItem: () => 's' })
    vi.stubGlobal('navigator', { onLine: false })
    await expect(streamCoachChat(body, { onText: () => {} })).rejects.toMatchObject({ code: 'offline' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

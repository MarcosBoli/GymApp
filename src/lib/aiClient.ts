import { AI_MAX_BODY_BYTES, aiError, aiErrorFromResponse, isAiErrorCode, type AiErrorInfo } from '../domain/aiErrors'
import { CHAT_STREAM_CONTENT_TYPE, splitChatEvents } from '../domain/chatStream'
import type { ChatTurn } from '../domain/coachChat'
import { getAiSecret } from './aiSecret'

/** Error de IA con mensaje listo para mostrar al usuario. */
export class AiRequestError extends Error {
  readonly code: AiErrorInfo['code']
  constructor(info: AiErrorInfo) {
    super(info.message)
    this.code = info.code
  }
}

export interface AiTextResult {
  text: string
  model: string
  truncated: boolean
  usage: { input_tokens: number; output_tokens: number }
}

export interface AiHealth {
  ok: true
  models: { plan: string; chat: string }
}

/** Algo más que el maxDuration de la función (60 s): si Vercel corta antes, llega su 504. */
const CLIENT_TIMEOUT_MS = 65_000

/** Comprobaciones comunes antes de llamar a /api: secreto, conexión y tamaño. */
function prepare(body: unknown): { secret: string; payload: string | undefined } {
  const secret = getAiSecret()
  if (!secret) throw new AiRequestError(aiError('missing_secret'))
  if (!navigator.onLine) throw new AiRequestError(aiError('offline'))
  const payload = body === undefined ? undefined : JSON.stringify(body)
  if (payload && new TextEncoder().encode(payload).byteLength > AI_MAX_BODY_BYTES) throw new AiRequestError(aiError('payload_too_large'))
  return { secret, payload }
}

/** Llama a una función /api con el secreto del dispositivo. Lanza AiRequestError con mensaje claro. */
export async function callAi<T>(path: '/api/health' | '/api/plan', body?: unknown): Promise<T> {
  const { secret, payload } = prepare(body)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(path, {
      method: payload ? 'POST' : 'GET',
      headers: { 'x-app-secret': secret, ...(payload ? { 'content-type': 'application/json' } : {}) },
      body: payload,
      signal: ctrl.signal,
      cache: 'no-store',
    })
  } catch {
    throw new AiRequestError(aiError(ctrl.signal.aborted ? 'timeout' : navigator.onLine ? 'network' : 'offline'))
  } finally {
    clearTimeout(timer)
  }

  // Si /api no existe, algunos servidores devuelven el index.html (200, no JSON)
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
    throw new AiRequestError(res.ok ? aiError('not_deployed') : aiErrorFromResponse(res.status, null))
  }
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new AiRequestError(aiErrorFromResponse(res.status, data))
  if (data === null) throw new AiRequestError(aiError('server_error'))
  return data as T
}

/** Sin recibir nada durante este tiempo, la respuesta en streaming se da por colgada. */
const STREAM_IDLE_MS = 30_000

export interface CoachStreamResult {
  text: string
  /** null si se paró antes de saberlo. */
  model: string | null
  truncated: boolean
}

/**
 * Chat del coach en streaming (/api/chat, NDJSON). `onText` recibe el texto acumulado.
 * Si el usuario lo para (`signal`) o la conexión se corta a medias, devuelve lo recibido
 * como truncado; los errores (también los que llegan a mitad del stream) se lanzan como
 * AiRequestError.
 */
export async function streamCoachChat(
  body: { messages: ChatTurn[]; context: string },
  opts: { onText: (text: string) => void; signal?: AbortSignal },
): Promise<CoachStreamResult> {
  const { secret, payload } = prepare(body)
  const ctrl = new AbortController()
  let stopped = false
  let idle = false
  const onStop = () => {
    stopped = true
    ctrl.abort()
  }
  if (opts.signal?.aborted) onStop()
  opts.signal?.addEventListener('abort', onStop)
  let timer: ReturnType<typeof setTimeout> | undefined
  const touch = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      idle = true
      ctrl.abort()
    }, STREAM_IDLE_MS)
  }

  let text = ''
  let model: string | null = null
  const partial = (): CoachStreamResult => ({ text, model, truncated: true })

  try {
    touch()
    let res: Response
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'x-app-secret': secret, 'content-type': 'application/json' },
        body: payload,
        signal: ctrl.signal,
        cache: 'no-store',
      })
    } catch {
      if (stopped) return partial()
      throw new AiRequestError(aiError(idle ? 'timeout' : navigator.onLine ? 'network' : 'offline'))
    }

    const type = res.headers.get('content-type') ?? ''
    if (!type.includes(CHAT_STREAM_CONTENT_TYPE)) {
      // Errores de antes de empezar (nuestro JSON) o respuestas que no son nuestras
      if (type.includes('application/json')) throw new AiRequestError(aiErrorFromResponse(res.status, await res.json().catch(() => null)))
      throw new AiRequestError(res.ok ? aiError('not_deployed') : aiErrorFromResponse(res.status, null))
    }
    if (!res.body) throw new AiRequestError(aiError('server_error'))

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch {
        // Cortado a medias (parado, colgado o sin red): vale lo recibido
        if (stopped || text) return partial()
        throw new AiRequestError(aiError(idle ? 'timeout' : 'network'))
      }
      if (chunk.done) break
      touch()
      buffer += decoder.decode(chunk.value, { stream: true })
      const { events, rest } = splitChatEvents(buffer)
      buffer = rest
      for (const e of events) {
        if (e.type === 'delta') {
          text += e.text
          opts.onText(text)
        } else if (e.type === 'done') {
          return { text, model: e.model, truncated: e.truncated }
        } else {
          throw new AiRequestError(isAiErrorCode(e.error.code) ? aiError(e.error.code) : aiError('server_error'))
        }
      }
    }
    // Terminó sin "done" (p. ej. Vercel cortó la función)
    if (text) return partial()
    throw new AiRequestError(aiError('server_error'))
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onStop)
  }
}

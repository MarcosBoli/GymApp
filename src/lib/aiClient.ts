import { AI_MAX_BODY_BYTES, aiError, aiErrorFromResponse, type AiErrorInfo } from '../domain/aiErrors'
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

/** Llama a una función /api con el secreto del dispositivo. Lanza AiRequestError con mensaje claro. */
export async function callAi<T>(path: '/api/health' | '/api/chat' | '/api/plan', body?: unknown): Promise<T> {
  const secret = getAiSecret()
  if (!secret) throw new AiRequestError(aiError('missing_secret'))
  if (!navigator.onLine) throw new AiRequestError(aiError('offline'))

  const payload = body === undefined ? undefined : JSON.stringify(body)
  if (payload && new TextEncoder().encode(payload).byteLength > AI_MAX_BODY_BYTES) throw new AiRequestError(aiError('payload_too_large'))

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

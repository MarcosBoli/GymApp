import { createHash, timingSafeEqual } from 'node:crypto'
import { aiError, type AiErrorCode } from '../../src/domain/aiErrors.js'

/** Error con código de la app y estado HTTP; los handlers lo convierten en respuesta JSON. */
export class HttpError extends Error {
  constructor(
    readonly code: AiErrorCode,
    readonly status: number,
  ) {
    super(code)
  }
}

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS })

export const errorResponse = (code: AiErrorCode, status: number) => json({ error: aiError(code) }, status)

/** Comparación en tiempo constante (hash previo: no revela la longitud del secreto). */
export function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/**
 * Lee y parsea el cuerpo JSON sin aceptar más de `maxBytes`: rechaza por Content-Length
 * y, si no viene o miente, corta la lectura al superar el límite.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError('payload_too_large', 413)
  if (!request.body) throw new HttpError('invalid_json', 400)

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new HttpError('payload_too_large', 413)
    }
    chunks.push(value)
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks))
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError('invalid_json', 400)
  }
}

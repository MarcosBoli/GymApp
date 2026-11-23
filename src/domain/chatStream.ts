/**
 * Protocolo de /api/chat en streaming: NDJSON (un evento JSON por línea).
 * Sin imports relativos: lo usan también las funciones del servidor.
 */

/** Límites del chat (los aplica el servidor; la app recorta el historial para no pasarlos). */
export const CHAT_LIMITS = {
  messages: 40,
  messageChars: 4000,
  totalChars: 30_000,
  contextChars: 16_000,
} as const

export const CHAT_STREAM_CONTENT_TYPE = 'application/x-ndjson'

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; model: string; truncated: boolean }
  | { type: 'error'; error: { code: string; message: string } }

export const encodeChatEvent = (event: ChatStreamEvent) => `${JSON.stringify(event)}\n`

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Interpreta una línea; null si no es un evento válido (se ignora). */
export function parseChatEvent(line: string): ChatStreamEvent | null {
  let v: unknown
  try {
    v = JSON.parse(line)
  } catch {
    return null
  }
  if (!isObject(v)) return null
  if (v.type === 'delta' && typeof v.text === 'string') return { type: 'delta', text: v.text }
  if (v.type === 'done' && typeof v.model === 'string') return { type: 'done', model: v.model, truncated: v.truncated === true }
  if (v.type === 'error' && isObject(v.error) && typeof v.error.code === 'string') {
    return { type: 'error', error: { code: v.error.code, message: typeof v.error.message === 'string' ? v.error.message : '' } }
  }
  return null
}

/**
 * Acumula texto recibido por trozos y devuelve los eventos de las líneas completas;
 * `rest` es la línea a medias que espera al siguiente trozo.
 */
export function splitChatEvents(buffer: string): { events: ChatStreamEvent[]; rest: string } {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  const events: ChatStreamEvent[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    const e = parseChatEvent(line)
    if (e) events.push(e)
  }
  return { events, rest }
}

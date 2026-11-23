import { HttpError } from './http.js'

export const LIMITS = {
  chatMessages: 40,
  messageChars: 4000,
  chatTotalChars: 30_000,
  contextChars: 16_000,
} as const

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  messages: ChatTurn[]
  context?: string
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const invalid = () => new HttpError('invalid_request', 400)

function optionalContext(v: unknown): string | undefined {
  if (v === undefined) return undefined
  if (typeof v !== 'string' || v.length > LIMITS.contextChars) throw invalid()
  return v.trim() || undefined
}

/** Historial de chat: alterna libremente, empieza y acaba en el usuario, con límites de tamaño. */
export function validateChatRequest(body: unknown): ChatRequest {
  if (!isObject(body) || !Array.isArray(body.messages)) throw invalid()
  const messages = body.messages
  if (messages.length === 0 || messages.length > LIMITS.chatMessages) throw invalid()
  let total = 0
  const turns: ChatTurn[] = messages.map((m) => {
    if (!isObject(m) || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') throw invalid()
    const content = m.content.trim()
    if (!content || content.length > LIMITS.messageChars) throw invalid()
    total += content.length
    return { role: m.role, content }
  })
  if (total > LIMITS.chatTotalChars) throw new HttpError('payload_too_large', 413)
  if (turns[0]!.role !== 'user' || turns.at(-1)!.role !== 'user') throw invalid()
  return { messages: turns, context: optionalContext(body.context) }
}

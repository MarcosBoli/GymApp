import Anthropic from '@anthropic-ai/sdk'
import type { AiErrorCode } from '../../src/domain/aiErrors.js'
import { HttpError } from './http.js'

/** Lo mínimo del cliente que usamos (permite inyectar uno falso en los tests). */
export interface AiClient {
  beta: { messages: { create: Anthropic['beta']['messages']['create'] } }
  models: { retrieve: Anthropic['models']['retrieve'] }
}

export const createAnthropicClient = (apiKey: string): AiClient => new Anthropic({ apiKey })

type Effort = 'low' | 'medium' | 'high'

export interface ClaudeCall {
  model: string
  system: string
  context?: string
  messages: Anthropic.Beta.BetaMessageParam[]
  maxTokens: number
  effort: Effort
  /** ms por intento. Con maxRetries, el total debe caber en el maxDuration de la función (60 s). */
  timeoutMs: number
  maxRetries: number
}

export interface ClaudeResult {
  text: string
  model: string
  /** true si se cortó por max_tokens. */
  truncated: boolean
  usage: { input_tokens: number; output_tokens: number }
}

/** Modelos que admiten `fallbacks` en el servidor (reintento automático si el modelo rechaza la petición). */
export const supportsServerFallback = (model: string) => /^claude-(sonnet-5-5|opus-5-5|opus-5|fable-5-[12])$/.test(model)
/** Generación 5.x: admiten output_config.effort. Con otros modelos no se envía. */
const supportsEffort = (model: string) => /^claude-(opus|sonnet|haiku|fable|mythos)-5/.test(model)

export async function callClaude(client: AiClient, call: ClaudeCall): Promise<ClaudeResult> {
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: call.system }]
  if (call.context) system.push({ type: 'text', text: `Datos del usuario (de su app):\n${call.context}` })

  const response = await client.beta.messages.create(
    {
      model: call.model,
      max_tokens: call.maxTokens,
      system,
      messages: call.messages,
      ...(supportsEffort(call.model) ? { output_config: { effort: call.effort } } : {}),
      ...(supportsServerFallback(call.model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    },
    { timeout: call.timeoutMs, maxRetries: call.maxRetries },
  )

  if (response.stop_reason === 'refusal') throw new HttpError('refused', 422)
  const text = response.content
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('')
    .trim()
  return {
    text,
    model: response.model,
    truncated: response.stop_reason === 'max_tokens',
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  }
}

/** Traduce los errores tipados del SDK a códigos de la app (de más específico a más general). */
export function mapAnthropicError(err: unknown): { code: AiErrorCode; status: number } {
  if (err instanceof HttpError) return { code: err.code, status: err.status }
  if (err instanceof Anthropic.APIConnectionTimeoutError) return { code: 'timeout', status: 504 }
  if (err instanceof Anthropic.APIConnectionError) return { code: 'ai_unreachable', status: 502 }
  if (err instanceof Anthropic.PaymentRequiredError) return { code: 'no_credit', status: 402 }
  if (err instanceof Anthropic.EnforcedSpendLimitReachedError || err instanceof Anthropic.ContractSpendLimitReachedError) {
    return { code: 'spend_limit', status: 402 }
  }
  if (err instanceof Anthropic.RateLimitError) return { code: 'rate_limited', status: 429 }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return { code: 'ai_auth', status: 502 }
  if (err instanceof Anthropic.NotFoundError) return { code: 'model_not_found', status: 502 }
  if (err instanceof Anthropic.BadRequestError) return { code: 'ai_bad_request', status: 502 }
  if (err instanceof Anthropic.InternalServerError) return { code: 'ai_unavailable', status: 503 }
  if (err instanceof Anthropic.APIError && err.status === 413) return { code: 'payload_too_large', status: 413 }
  return { code: 'server_error', status: 500 }
}

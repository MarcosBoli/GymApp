import { z } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'
import type { AiErrorCode } from '../../src/domain/aiErrors.js'
import { modelOptions, type AiClient, type Effort } from './claude.js'
import { HttpError } from './http.js'

/** Esquema JSON de una herramienta desde zod (como betaZodTool del SDK), sin la clave $schema. */
export function toolFromZod(name: string, description: string, schema: z.ZodType): Anthropic.Beta.BetaTool {
  const { $schema: _dialect, ...input } = z.toJSONSchema(schema, { reused: 'ref' })
  return { name, description, input_schema: input as Anthropic.Beta.BetaTool['input_schema'] }
}

export const formatZodIssues = (issues: { path: PropertyKey[]; message: string }[]) => issues.slice(0, 10).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)

export type ToolParse<T> = { ok: true; value: T } | { ok: false; errors: string[] }

export interface ToolCallOptions<T> {
  model: string
  system: string
  content: Anthropic.Beta.BetaContentBlockParam[]
  tools: Anthropic.Beta.BetaTool[]
  effort: Effort
  maxTokens: number
  deadline: number
  now?: () => number
  /** Valida la llamada a una de las herramientas (undefined = no llamó a ninguna). */
  parse: (call: Anthropic.Beta.BetaToolUseBlock | undefined) => ToolParse<T>
  /** Código de error si tras el reintento sigue sin ser válida. */
  invalidCode: AiErrorCode
  label: string
}

export interface ToolCallResult<T> {
  value: T
  model: string
  attempts: number
  usage: { input_tokens: number; output_tokens: number }
}

/**
 * Pide al modelo que llame a una herramienta (tool_choice automático: Sonnet/Opus 5.5 y Fable 5.1+
 * rechazan con 400 el uso forzado) y valida la entrada con `parse`. Si no es válida, reintenta UNA
 * vez explicando los errores, siempre que queden ≥ 15 s antes de `deadline` (la función tiene 60 s).
 */
export async function callToolWithRetry<T>(client: AiClient, o: ToolCallOptions<T>): Promise<ToolCallResult<T>> {
  const now = o.now ?? Date.now
  const names = new Set(o.tools.map((t) => t.name))
  const usage = { input_tokens: 0, output_tokens: 0 }
  let errors: string[] = []
  let previous = ''

  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = o.deadline - now()
    if (attempt === 2 && remaining < 15_000) break
    const content =
      attempt === 1
        ? o.content
        : [...o.content, { type: 'text' as const, text: `Tu respuesta anterior no era válida. Corrige estos errores y llama otra vez a la herramienta con la respuesta completa:\n- ${errors.join('\n- ')}\n\nRespuesta anterior:\n${previous}` }]

    const response = await client.beta.messages.create(
      {
        model: o.model,
        // Holgura para el razonamiento (los modelos 5.5 piensan por defecto y cuenta en max_tokens)
        max_tokens: o.maxTokens,
        system: o.system,
        messages: [{ role: 'user', content }],
        tools: o.tools,
        ...modelOptions(o.model, o.effort),
      },
      { timeout: Math.max(5_000, Math.min(45_000, remaining - 2_000)), maxRetries: 0 },
    )
    usage.input_tokens += response.usage.input_tokens
    usage.output_tokens += response.usage.output_tokens
    if (response.stop_reason === 'refusal') throw new HttpError('refused', 422)

    const call = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && names.has(b.name))
    previous = JSON.stringify(call ? { herramienta: call.name, entrada: call.input } : null).slice(0, 4000)
    if (response.stop_reason === 'max_tokens') {
      errors = ['La respuesta se cortó por longitud: sé más conciso y devuelve la respuesta completa.']
      continue
    }
    const parsed = o.parse(call)
    if (parsed.ok) return { value: parsed.value, model: response.model, attempts: attempt, usage }
    errors = parsed.errors
  }
  console.error(`[ai] ${o.label} inválida tras reintento:`, errors)
  throw new HttpError(o.invalidCode, 502)
}

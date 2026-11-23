import { AI_MAX_BODY_BYTES } from '../../src/domain/aiErrors.js'
import { callClaude, createAnthropicClient, mapAnthropicError, type AiClient } from './claude.js'
import { readAiConfig, type AiConfig, type Env } from './env.js'
import { errorResponse, HttpError, json, readJsonBody, secretMatches } from './http.js'
import { validateChatRequest } from './validate.js'
import { generatePlan } from './plan.js'
import { PlanRequestSchema } from '../../src/domain/planSchema.js'

export const SECRET_HEADER = 'x-app-secret'

const CHAT_SYSTEM = `Eres el asistente de GymApp, una app de entrenamiento de fuerza y nutrición.
Responde en español de España, de forma breve, práctica y segura. Si te dan datos del usuario, úsalos.
No des consejo médico; ante dolor o lesión, recomienda consultar a un profesional.`

export interface HandlerDeps {
  env: Env
  makeClient?: (apiKey: string) => AiClient
  now?: () => number
}

/** Presupuesto de /api/plan: un poco menos que el maxDuration (60 s) de la función. */
export const PLAN_BUDGET_MS = 57_000

/**
 * Handlers de las funciones /api. Orden de comprobaciones: método → configuración →
 * secreto (401) → tamaño (413) → JSON (400) → validación (400) → Claude.
 */
export function createAiHandlers({ env, makeClient = createAnthropicClient, now = Date.now }: HandlerDeps) {
  async function guarded(request: Request, method: string, run: (config: AiConfig, client: AiClient) => Promise<Response>) {
    if (request.method !== method) return errorResponse('method_not_allowed', 405)
    const cfg = readAiConfig(env)
    if (!cfg.ok) {
      console.error(`[ai] faltan variables de entorno: ${cfg.missing.join(', ')}`)
      return errorResponse('not_configured', 500)
    }
    if (!secretMatches(request.headers.get(SECRET_HEADER), cfg.config.appSecret)) return errorResponse('unauthorized', 401)
    try {
      return await run(cfg.config, makeClient(cfg.config.apiKey))
    } catch (err) {
      const { code, status } = mapAnthropicError(err)
      if (status >= 500) console.error('[ai]', code, err)
      return errorResponse(code, status)
    }
  }

  return {
    /** Comprueba secreto, configuración y que la API key ve los dos modelos (sin gastar tokens). */
    health: (request: Request) =>
      guarded(request, 'GET', async (config, client) => {
        for (const model of [config.planModel, config.chatModel]) await client.models.retrieve(model, {}, { timeout: 8000, maxRetries: 0 })
        return json({ ok: true, models: { plan: config.planModel, chat: config.chatModel } })
      }),

    chat: (request: Request) =>
      guarded(request, 'POST', async (config, client) => {
        const body = validateChatRequest(await readJsonBody(request, AI_MAX_BODY_BYTES))
        const result = await callClaude(client, {
          model: config.chatModel,
          system: CHAT_SYSTEM,
          context: body.context,
          messages: body.messages,
          maxTokens: 2000,
          effort: 'low',
          timeoutMs: 25_000,
          maxRetries: 1,
        })
        return json(result)
      }),

    /** Rutina semanal: contexto del usuario + catálogo → plan validado (zod + catálogo, 1 reintento). */
    plan: (request: Request) =>
      guarded(request, 'POST', async (config, client) => {
        const started = now()
        const body = PlanRequestSchema.safeParse(await readJsonBody(request, AI_MAX_BODY_BYTES))
        if (!body.success) throw new HttpError('invalid_request', 400)
        const result = await generatePlan(client, config.planModel, body.data, { deadline: started + PLAN_BUDGET_MS, now })
        return json(result)
      }),
  }
}

export { HttpError }

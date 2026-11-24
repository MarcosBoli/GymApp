import { AI_MAX_BODY_BYTES } from '../../src/domain/aiErrors.js'
import { createAnthropicClient, mapAnthropicError, type AiClient } from './claude.js'
import { streamChat } from './chat.js'
import { readAiConfig, type AiConfig, type Env } from './env.js'
import { errorResponse, HttpError, json, readJsonBody, secretMatches } from './http.js'
import { validateChatRequest } from './validate.js'
import { generatePlan } from './plan.js'
import { PlanRequestSchema } from '../../src/domain/planSchema.js'
import { FOOD_ESTIMATE_MAX_BODY_BYTES, FoodEstimateRequestSchema } from '../../src/domain/foodEstimateSchema.js'
import { estimateFood } from './foodEstimate.js'
import { MealSuggestRequestSchema, RecipeRequestSchema } from '../../src/domain/mealSchema.js'
import { generateRecipe, suggestMeals } from './meals.js'

export const SECRET_HEADER = 'x-app-secret'

export interface HandlerDeps {
  env: Env
  makeClient?: (apiKey: string) => AiClient
  now?: () => number
}

/** Presupuesto de /api/plan: un poco menos que el maxDuration (60 s) de la función. */
export const PLAN_BUDGET_MS = 57_000
/** Presupuesto de /api/food-estimate (un intento + reintento si queda tiempo). */
export const FOOD_BUDGET_MS = 57_000
/** Tiempo máximo de una respuesta del chat en streaming (luego se corta como truncada). */
export const CHAT_BUDGET_MS = 55_000

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
        for (const model of new Set([config.planModel, config.chatModel, config.foodModel, config.mealModel, config.recipeModel])) await client.models.retrieve(model, {}, { timeout: 8000, maxRetries: 0 })
        return json({ ok: true, models: { plan: config.planModel, chat: config.chatModel, food: config.foodModel, meal: config.mealModel, recipe: config.recipeModel } })
      }),

    /** Chat del coach: respuesta en streaming (NDJSON) de CHAT_MODEL. */
    chat: (request: Request) =>
      guarded(request, 'POST', async (config, client) => {
        const started = now()
        const body = validateChatRequest(await readJsonBody(request, AI_MAX_BODY_BYTES))
        return streamChat(client, config.chatModel, body, { deadline: started + CHAT_BUDGET_MS, now })
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

    /** Comida por texto, foto o ambos → estimación o preguntas de aclaración (tool use validado con zod, 1 reintento). */
    foodEstimate: (request: Request) =>
      guarded(request, 'POST', async (config, client) => {
        const started = now()
        const body = FoodEstimateRequestSchema.safeParse(await readJsonBody(request, FOOD_ESTIMATE_MAX_BODY_BYTES))
        if (!body.success) throw new HttpError('invalid_request', 400)
        const result = await estimateFood(client, config.foodModel, body.data, { deadline: started + FOOD_BUDGET_MS, now })
        return json(result)
      }),

    /** Qué comer: 6 opciones (3 sencillas + 3 elaboradas) ajustadas a lo que queda del día (MEAL_MODEL). */
    mealSuggestions: (request: Request) =>
      guarded(request, 'POST', async (config, client) => {
        const started = now()
        const body = MealSuggestRequestSchema.safeParse(await readJsonBody(request, AI_MAX_BODY_BYTES))
        if (!body.success) throw new HttpError('invalid_request', 400)
        const r = await suggestMeals(client, config.mealModel, body.data, { deadline: started + FOOD_BUDGET_MS, now })
        return json(r)
      }),

    /** Receta de la opción elegida, con ingredientes en gramos que suman sus macros (RECIPE_MODEL). */
    recipe: (request: Request) =>
      guarded(request, 'POST', async (config, client) => {
        const started = now()
        const body = RecipeRequestSchema.safeParse(await readJsonBody(request, AI_MAX_BODY_BYTES))
        if (!body.success) throw new HttpError('invalid_request', 400)
        const r = await generateRecipe(client, config.recipeModel, body.data, { deadline: started + FOOD_BUDGET_MS, now })
        return json({ receta: r.value, model: r.model, attempts: r.attempts, usage: r.usage })
      }),
  }
}

export { HttpError }

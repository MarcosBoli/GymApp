import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { buildRecipePrompt, buildSuggestPrompt, generateRecipe, MEAL_SYSTEM, RECIPE_SYSTEM, RECIPE_TOOL, SUGGEST_TOOL, suggestMeals } from './meals.js'
import { createAiHandlers, SECRET_HEADER } from './handlers.js'
import type { AiClient } from './claude.js'
import { AI_ERROR_MESSAGES } from '../../src/domain/aiErrors.js'
import type { MealPrefs, MealSuggestRequest, Recipe, Suggestion } from '../../src/domain/mealSchema.js'

const prefs: MealPrefs = { noLeGusta: 'coliflor, hígado', dieta: 'omnivora', presupuesto: 'bajo', utensilios: ['sarten', 'microondas'], tiempoMaxMin: 30 }
const req = (over: Partial<MealSuggestRequest['context']> = {}, excluir?: string[]): MealSuggestRequest => ({
  context: {
    comida: 'dinner',
    objetivo: 'deficit',
    quedaHoy: { kcal: 700, proteina: 55, carbohidratos: 60, grasa: 22 },
    objetivoComida: { kcal: 700, proteina: 55, carbohidratos: 60, grasa: 22 },
    ligera: false,
    preferencias: prefs,
    ultimasComidas: ['Macarrones con tomate', 'Lentejas'],
    peticion: 'algo con pollo',
    ...over,
  },
  ...(excluir ? { excluir } : {}),
})

const opt = (nombre: string, tipo: 'sencilla' | 'elaborada', over: Partial<Suggestion> = {}): Suggestion => ({
  id: 'x',
  nombre,
  tipo,
  descripcion: 'Plato con pollo.',
  tiempoMin: tipo === 'sencilla' ? 12 : 30,
  dificultad: 'facil',
  raciones: 1,
  gramosRacion: 350,
  kcal: 650,
  proteina: 52,
  carbohidratos: 60,
  grasa: 22,
  ingredientesClave: ['pollo', 'arroz', 'pimiento'],
  porQueEncaja: 'Te aporta 52 g de proteína de los 55 que te faltan.',
  ...over,
})
const six = (): Suggestion[] => [
  opt('Pollo al curry rápido', 'sencilla'),
  opt('Wrap de pollo', 'sencilla'),
  opt('Arroz con pollo al microondas', 'sencilla'),
  opt('Pollo al ajillo con patatas', 'elaborada'),
  opt('Fajitas de pollo', 'elaborada'),
  opt('Pollo teriyaki con arroz', 'elaborada'),
]

const recipe: Recipe = {
  nombre: 'Pollo al curry rápido',
  raciones: 1,
  tiempoTotal: 12,
  ingredientes: [
    { nombre: 'Pechuga de pollo', gramos: 180, kcal: 198, proteina: 40, carbohidratos: 0, grasa: 4 },
    { nombre: 'Arroz basmati (crudo)', gramos: 70, kcal: 245, proteina: 5, carbohidratos: 54, grasa: 0.5 },
    { nombre: 'Leche de coco light', gramos: 100, medidaCasera: 'medio vaso', kcal: 80, proteina: 1, carbohidratos: 3, grasa: 7 },
    { nombre: 'Aceite de oliva', gramos: 10, medidaCasera: '1 cucharada', kcal: 90, proteina: 0, carbohidratos: 0, grasa: 10 },
    { nombre: 'Curry en polvo', gramos: 5, kcal: 16, proteina: 0.7, carbohidratos: 2.8, grasa: 0.7 },
  ],
  pasos: [{ texto: 'Cuece el arroz.', minutos: 10 }, { texto: 'Dora el pollo y añade el curry y la leche de coco.', minutos: 8 }],
  consejos: ['Sustituye la leche de coco por yogur natural para menos grasa.'],
  kcal: 1, // mal sumado a propósito: se recalcula
  proteina: 1,
  carbohidratos: 1,
  grasa: 1,
}

type Reply = { tool?: string; input?: unknown; stop_reason?: string; noTool?: boolean }
function client(...replies: Reply[]) {
  const create = vi.fn(async () => {
    const r = replies.shift()!
    return {
      model: 'claude-haiku-5-5',
      stop_reason: r.stop_reason ?? 'tool_use',
      content: r.noTool ? [{ type: 'text', text: 'Hola' }] : [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'tool_use', id: 't1', name: r.tool ?? SUGGEST_TOOL, input: r.input }],
      usage: { input_tokens: 500, output_tokens: 900 },
    }
  })
  return { client: { beta: { messages: { create } }, models: { retrieve: vi.fn() } } as unknown as AiClient, create }
}
type Params = { model: string; max_tokens: number; system: string; tools: { name: string; input_schema: Record<string, unknown> }[]; tool_choice?: unknown; output_config?: { effort: string }; messages: { content: { text: string }[] }[]; fallbacks?: string }
const params = (create: ReturnType<typeof vi.fn>, i = 0) => (create.mock.calls[i] as unknown as [Params])[0]
const deadline = () => Date.now() + 57_000

describe('suggestMeals', () => {
  it('6 opciones válidas: tool use sin forzar, ids s1-s3 / e1-e3', async () => {
    const { client: c, create } = client({ input: { opciones: six() } })
    const r = await suggestMeals(c, 'claude-haiku-5-5', req(), { deadline: deadline() })
    expect(r.attempts).toBe(1)
    expect(r.value.map((o) => o.id)).toEqual(['s1', 's2', 's3', 'e1', 'e2', 'e3'])
    const p = params(create)
    expect(p.tools.map((t) => t.name)).toEqual([SUGGEST_TOOL])
    expect(p.tool_choice).toBeUndefined()
    expect(p).toMatchObject({ model: 'claude-haiku-5-5', output_config: { effort: 'low' } })
    expect(p.tools[0]!.input_schema).not.toHaveProperty('$schema')
  })

  it('el prompt lleva lo que queda, el objetivo de la comida, preferencias, últimas comidas, petición y exclusiones', () => {
    const text = buildSuggestPrompt(req({}, ['Pollo al horno']))
    for (const s of ['Comida: cena', 'déficit', 'Le queda hoy: 700 kcal · 55 g proteína', 'Objetivo para esta comida (±15 %)', 'No le gusta: coliflor, hígado', 'Utensilios: sartén, microondas', 'Tiempo máximo para cocinar: 30 min', 'Elaboradas: como mucho 30 min', 'no repetir): Macarrones con tomate, Lentejas', 'Petición del usuario: algo con pollo', 'propón otras distintas): Pollo al horno']) {
      expect(text).toContain(s)
    }
  })

  it('el system prompt cubre las reglas', () => {
    for (const s of ['3 "sencilla"', '3 "elaborada"', '±15 %', 'prioriza la proteína', 'Nunca te pases del total', 'sin sermones', 'utensilios', 'supermercado español', 'Variedad', 'No repitas']) expect(MEAL_SYSTEM).toContain(s)
  })

  it('pocas kcal restantes (o negativas): pide opciones ligeras, sin objetivo de comida', () => {
    const text = buildSuggestPrompt(req({ quedaHoy: { kcal: -120, proteina: 10, carbohidratos: -30, grasa: -5 }, objetivoComida: { kcal: 0, proteina: 10, carbohidratos: 0, grasa: 0 }, ligera: true }))
    expect(text).toContain('Le queda hoy: -120 kcal')
    expect(text).toContain('opciones ligeras')
    expect(text).not.toContain('Objetivo para esta comida')
  })

  it('macros incoherentes → reintenta una vez con el error', async () => {
    const bad = six()
    bad[0] = { ...bad[0]!, kcal: 900 } // 4·52 + 4·60 + 9·22 = 646
    const { client: c, create } = client({ input: { opciones: bad } }, { input: { opciones: six() } })
    const r = await suggestMeals(c, 'claude-haiku-5-5', req(), { deadline: deadline() })
    expect(r.attempts).toBe(2)
    expect(params(create, 1).messages[0]!.content.at(-1)!.text).toContain('no cuadra con los macros')
  })

  it('no son 3 + 3 → reintenta; repetir una ya vista → reintenta', async () => {
    const bad = six().map((o) => ({ ...o, tipo: 'sencilla' as const, tiempoMin: 10 }))
    const a = client({ input: { opciones: bad } }, { input: { opciones: six() } })
    expect((await suggestMeals(a.client, 'm', req(), { deadline: deadline() })).attempts).toBe(2)
    expect(params(a.create, 1).messages[0]!.content.at(-1)!.text).toContain('exactamente 3 sencillas y 3 elaboradas')
    const b = client({ input: { opciones: six() } }, { input: { opciones: six().map((o, i) => ({ ...o, nombre: `${o.nombre} ${i}` })) } })
    const r = await suggestMeals(b.client, 'm', req({}, ['Wrap de pollo']), { deadline: deadline() })
    expect(r.attempts).toBe(2)
    expect(params(b.create, 1).messages[0]!.content.at(-1)!.text).toContain('ya se la propusiste')
  })

  it('dos fallos → invalid_suggestions', async () => {
    const bad = { input: { opciones: six().slice(0, 5) } }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(suggestMeals(client(bad, bad).client, 'm', req(), { deadline: deadline() })).rejects.toMatchObject({ code: 'invalid_suggestions', status: 502 })
    spy.mockRestore()
  })
})

describe('generateRecipe', () => {
  const option = opt('Pollo al curry rápido', 'sencilla', { kcal: 629, proteina: 46.7, carbohidratos: 59.8, grasa: 22.2 })

  it('receta válida: totales recalculados desde los ingredientes', async () => {
    const { client: c, create } = client({ tool: RECIPE_TOOL, input: recipe })
    const r = await generateRecipe(c, 'claude-sonnet-5-5', { opcion: option, preferencias: prefs }, { deadline: deadline() })
    expect(r.value).toMatchObject({ kcal: 629, proteina: 46.7, carbohidratos: 59.8, grasa: 22.2, ingredientes: recipe.ingredientes })
    const p = params(create)
    expect(p).toMatchObject({ model: 'claude-sonnet-5-5', output_config: { effort: 'medium' }, fallbacks: 'default' })
    expect(p.tools.map((t) => t.name)).toEqual([RECIPE_TOOL])
    expect(p.messages[0]!.content[0]!.text).toContain('Debe sumar (±10 %), para 1 ración de ~350 g: 629 kcal')
    expect(RECIPE_SYSTEM).toContain('deben sumar lo prometido (±10 %)')
  })

  it('los ingredientes no suman lo prometido → reintenta; dos veces → invalid_recipe', async () => {
    const big = { ...option, kcal: 900, proteina: 70, carbohidratos: 80, grasa: 32 }
    const fixed = { ...recipe, ingredientes: [...recipe.ingredientes, { nombre: 'Pan', gramos: 100, kcal: 271, proteina: 23.3, carbohidratos: 20.2, grasa: 9.8 }] }
    const { client: c, create } = client({ tool: RECIPE_TOOL, input: recipe }, { tool: RECIPE_TOOL, input: fixed })
    const r = await generateRecipe(c, 'm', { opcion: big, preferencias: prefs }, { deadline: deadline() })
    expect(r.attempts).toBe(2)
    expect(params(create, 1).messages[0]!.content.at(-1)!.text).toContain('Los ingredientes suman 629 de kcal')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(generateRecipe(client({ tool: RECIPE_TOOL, input: recipe }, { tool: RECIPE_TOOL, input: recipe }).client, 'm', { opcion: big, preferencias: prefs }, { deadline: deadline() })).rejects.toMatchObject({ code: 'invalid_recipe' })
    spy.mockRestore()
  })

  it('el prompt lleva la opción y las preferencias', () => {
    const text = buildRecipePrompt({ opcion: option, preferencias: prefs })
    expect(text).toContain('Receta de: Pollo al curry rápido (sencilla, 12 min, facil)')
    expect(text).toContain('Ingredientes clave: pollo, arroz, pimiento')
    expect(text).toContain('No le gusta: coliflor, hígado')
  })
})

describe('endpoints', () => {
  const ENV = { ANTHROPIC_API_KEY: 'sk-test', APP_SECRET: 's3cr3t' }
  const post = (path: string, body: unknown, secret = 's3cr3t') =>
    new Request(`https://app.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', [SECRET_HEADER]: secret }, body: JSON.stringify(body) })

  it('MEAL_MODEL (Haiku por defecto) y RECIPE_MODEL (Sonnet por defecto), configurables', async () => {
    const a = client({ input: { opciones: six() } })
    const res = await createAiHandlers({ env: ENV, makeClient: () => a.client }).mealSuggestions(post('/api/meal-suggestions', req()))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ opciones: [{ id: 's1' }, {}, {}, {}, {}, {}] })
    expect(params(a.create).model).toBe('claude-haiku-5-5')
    const b = client({ tool: RECIPE_TOOL, input: recipe })
    const option = opt('Pollo al curry rápido', 'sencilla', { kcal: 629, proteina: 46.7, carbohidratos: 59.8, grasa: 22.2 })
    const res2 = await createAiHandlers({ env: { ...ENV, RECIPE_MODEL: 'claude-opus-5-5' }, makeClient: () => b.client }).recipe(post('/api/recipe', { opcion: option, preferencias: prefs }))
    expect(res2.status).toBe(200)
    expect(await res2.json()).toMatchObject({ receta: { nombre: 'Pollo al curry rápido', kcal: 629 } })
    expect(params(b.create).model).toBe('claude-opus-5-5')
  })

  it('401, 400 y 402 con sus mensajes', async () => {
    const { client: c, create } = client()
    const h = createAiHandlers({ env: ENV, makeClient: () => c })
    expect((await h.mealSuggestions(post('/api/meal-suggestions', req(), 'x'))).status).toBe(401)
    expect((await h.recipe(post('/api/recipe', { opcion: { nombre: 'x' } }))).status).toBe(400)
    expect(create).not.toHaveBeenCalled()
    const noCredit = Anthropic.APIError.generate(402, { type: 'error', error: { type: 'billing_error', message: 'x' } }, undefined, new Headers())
    const broke = { beta: { messages: { create: vi.fn(async () => { throw noCredit }) } }, models: { retrieve: vi.fn() } } as unknown as AiClient
    const res = await createAiHandlers({ env: ENV, makeClient: () => broke }).mealSuggestions(post('/api/meal-suggestions', req()))
    expect(res.status).toBe(402)
    expect(((await res.json()) as { error: unknown }).error).toEqual({ code: 'no_credit', message: AI_ERROR_MESSAGES.no_credit })
  })
})

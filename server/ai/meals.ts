import type Anthropic from '@anthropic-ai/sdk'
import {
  ELABORATE_MAX_MIN,
  RecipeToolSchema,
  SIMPLE_MAX_INGREDIENTS,
  SIMPLE_MAX_MIN,
  SuggestionsToolSchema,
  elaborateMaxMin,
  recipeErrors,
  suggestionErrors,
  sumIngredients,
  type Macros,
  type MealPrefs,
  type MealSuggestRequest,
  type Recipe,
  type RecipeRequest,
  type Suggestion,
} from '../../src/domain/mealSchema.js'
import type { AiClient } from './claude.js'
import { callToolWithRetry, formatZodIssues, toolFromZod, type ToolCallResult, type ToolParse } from './tools.js'

export const SUGGEST_TOOL = 'proponer_comidas'
export const RECIPE_TOOL = 'escribir_receta'

export const MEAL_SYSTEM = `Eres un dietista-nutricionista y cocinero que propone qué comer en España, ajustándose a lo que le queda del día a la persona.

Reglas:
- Propón exactamente 6 opciones: 3 "sencilla" (≤ ${SIMPLE_MAX_MIN} min, ≤ ${SIMPLE_MAX_INGREDIENTS} ingredientes, de despensa española típica) y 3 "elaborada" (≤ ${ELABORATE_MAX_MIN} min y sin pasar del tiempo máximo del usuario, con más sabor y técnica).
- Ajusta cada opción a las kcal y macros objetivo de esta comida (±15 %). Si va corto de proteína, prioriza la proteína. Nunca te pases del total que le queda del día.
- Si le queda muy poco o nada (o es negativo), propón opciones ligeras y dilo con naturalidad en "porQueEncaja", sin sermones ni recomendaciones extremas (nada de ayunos ni de "no comas").
- Respeta lo que no le gusta, su tipo de dieta, su presupuesto y los utensilios que tiene (no propongas horno si no lo tiene).
- Comida real de supermercado español (Mercadona, Lidl, Carrefour…), con cantidades realistas para 1 ración. Variedad entre opciones (proteínas, cocinas y técnicas distintas). No repitas lo que ha comido los últimos días ni lo que ya se le propuso.
- Valores nutricionales estándar (BEDCA / europeos). Las kcal deben cuadrar con los macros (4/4/9, ±10 %).
- "gramosRacion": peso aproximado del plato servido.
- Textos en español de España, breves. "descripcion" y "porQueEncaja", una frase cada una; en "porQueEncaja" di cómo encaja con lo que le queda hoy (p. ej. "Te aporta 40 g de proteína de los 55 que te faltan").

Responde SIEMPRE llamando a la herramienta ${SUGGEST_TOOL}.`

export const RECIPE_SYSTEM = `Eres un cocinero y dietista-nutricionista que escribe recetas caseras para una persona en España.

Reglas:
- Escribe la receta de la opción indicada para 1 ración, respetando sus kcal y macros: los ingredientes, en gramos, deben sumar lo prometido (±10 %). Ajusta las cantidades (aceite incluido) para que cuadre.
- Cada ingrediente con sus gramos, kcal y macros (valores BEDCA / europeos; kcal coherentes con 4/4/9) y, si ayuda, una medida casera española ("1 cucharada", "1 huevo L", "1 vaso").
- Ingredientes de supermercado español; respeta lo que no le gusta, su dieta, su presupuesto y sus utensilios.
- Pasos numerados, claros y breves, con minutos cuando tenga sentido. "tiempoTotal" realista.
- "consejos" opcionales: 1-3 trucos prácticos (sustituciones, cómo conservar, cómo ganar sabor sin calorías).

Responde SIEMPRE llamando a la herramienta ${RECIPE_TOOL}.`

export const suggestTool = () => toolFromZod(SUGGEST_TOOL, 'Propone exactamente 6 opciones de comida (3 sencillas y 3 elaboradas).', SuggestionsToolSchema)
export const recipeTool = () => toolFromZod(RECIPE_TOOL, 'Escribe la receta de la opción elegida, con los ingredientes en gramos y sus macros.', RecipeToolSchema)

const MEAL_NAMES = { breakfast: 'desayuno', lunch: 'comida', dinner: 'cena', snack: 'merienda / snack' } as const
const GOAL_NAMES = { deficit: 'déficit (perder grasa)', mantenimiento: 'mantenimiento', superavit: 'superávit (ganar músculo)' } as const
const DIET_NAMES = { omnivora: 'omnívora', vegetariana: 'vegetariana', vegana: 'vegana', pescetariana: 'pescetariana' } as const
const UTENSIL_NAMES = { sarten: 'sartén', horno: 'horno', microondas: 'microondas', airfryer: 'airfryer' } as const

const round = (n: number) => Math.round(n)
const macrosLine = (m: Macros) => `${round(m.kcal)} kcal · ${round(m.proteina)} g proteína · ${round(m.carbohidratos)} g carbohidratos · ${round(m.grasa)} g grasa`

export function prefsLines(p: MealPrefs): string[] {
  return [
    `Dieta: ${DIET_NAMES[p.dieta]}. Presupuesto: ${p.presupuesto}. Utensilios: ${p.utensilios.map((u) => UTENSIL_NAMES[u]).join(', ')}. Tiempo máximo para cocinar: ${p.tiempoMaxMin} min.`,
    p.noLeGusta.trim() ? `No le gusta: ${p.noLeGusta.trim()}.` : 'No ha indicado alimentos que no le gusten.',
  ]
}

/** Mensaje para pedir las 6 opciones. */
export function buildSuggestPrompt(req: MealSuggestRequest): string {
  const c = req.context
  const lines = [
    `Comida: ${MEAL_NAMES[c.comida]}. Objetivo: ${GOAL_NAMES[c.objetivo]}.`,
    `Le queda hoy: ${macrosLine(c.quedaHoy)}.`,
    c.ligera
      ? `Le queda muy poco o nada del día: propón opciones ligeras (≈ 100-300 kcal) y dilo con naturalidad, sin sermones.`
      : `Objetivo para esta comida (±15 %): ${macrosLine(c.objetivoComida)}.`,
    ...prefsLines(c.preferencias),
    `Elaboradas: como mucho ${elaborateMaxMin(c.preferencias.tiempoMaxMin)} min.`,
    c.ultimasComidas.length ? `Ha comido los últimos días (no repetir): ${c.ultimasComidas.join(', ')}.` : 'No hay comidas registradas los últimos días.',
  ]
  if (c.peticion?.trim()) lines.push(`Petición del usuario: ${c.peticion.trim()}`)
  if (req.excluir?.length) lines.push(`Ya se le propusieron (propón otras distintas): ${req.excluir.join(', ')}.`)
  lines.push(`Llama a ${SUGGEST_TOOL} con las 6 opciones.`)
  return lines.join('\n')
}

function parseSuggestions(call: Anthropic.Beta.BetaToolUseBlock | undefined, req: MealSuggestRequest): ToolParse<Suggestion[]> {
  if (!call) return { ok: false, errors: [`No llamaste a la herramienta ${SUGGEST_TOOL}.`] }
  const parsed = SuggestionsToolSchema.safeParse(call.input)
  if (!parsed.success) return { ok: false, errors: formatZodIssues(parsed.error.issues) }
  const errors = suggestionErrors(parsed.data.opciones, { tiempoMaxMin: req.context.preferencias.tiempoMaxMin, excluir: req.excluir })
  if (errors.length) return { ok: false, errors }
  // Ids estables y únicos (los del modelo pueden repetirse): sencillas s1-s3, elaboradas e1-e3
  const counters = { sencilla: 0, elaborada: 0 }
  const opciones = parsed.data.opciones.map((o) => ({ ...o, id: `${o.tipo === 'sencilla' ? 's' : 'e'}${++counters[o.tipo]}`, nombre: o.nombre.trim() }))
  return { ok: true, value: opciones }
}

export function suggestMeals(client: AiClient, model: string, req: MealSuggestRequest, opts: { deadline: number; now?: () => number }): Promise<ToolCallResult<Suggestion[]>> {
  return callToolWithRetry(client, {
    model,
    system: MEAL_SYSTEM,
    content: [{ type: 'text', text: buildSuggestPrompt(req) }],
    tools: [suggestTool()],
    effort: 'low',
    maxTokens: 8000,
    deadline: opts.deadline,
    now: opts.now,
    parse: (call) => parseSuggestions(call, req),
    invalidCode: 'invalid_suggestions',
    label: 'recomendación de comidas',
  })
}

/** Mensaje para pedir la receta de la opción elegida. */
export function buildRecipePrompt(req: RecipeRequest): string {
  const o = req.opcion
  return [
    `Receta de: ${o.nombre} (${o.tipo}, ${o.tiempoMin} min, ${o.dificultad}). ${o.descripcion}`,
    `Ingredientes clave: ${o.ingredientesClave.join(', ')}.`,
    `Debe sumar (±10 %), para 1 ración de ~${round(o.gramosRacion)} g: ${macrosLine(o)}.`,
    ...prefsLines(req.preferencias),
    `Llama a ${RECIPE_TOOL} con la receta.`,
  ].join('\n')
}

function parseRecipe(call: Anthropic.Beta.BetaToolUseBlock | undefined, req: RecipeRequest): ToolParse<Recipe> {
  if (!call) return { ok: false, errors: [`No llamaste a la herramienta ${RECIPE_TOOL}.`] }
  const parsed = RecipeToolSchema.safeParse(call.input)
  if (!parsed.success) return { ok: false, errors: formatZodIssues(parsed.error.issues) }
  const errors = recipeErrors(parsed.data, req.opcion)
  if (errors.length) return { ok: false, errors }
  // Totales siempre los de los ingredientes
  return { ok: true, value: { ...parsed.data, ...sumIngredients(parsed.data.ingredientes) } }
}

export function generateRecipe(client: AiClient, model: string, req: RecipeRequest, opts: { deadline: number; now?: () => number }): Promise<ToolCallResult<Recipe>> {
  return callToolWithRetry(client, {
    model,
    system: RECIPE_SYSTEM,
    content: [{ type: 'text', text: buildRecipePrompt(req) }],
    tools: [recipeTool()],
    effort: 'medium',
    maxTokens: 8000,
    deadline: opts.deadline,
    now: opts.now,
    parse: (call) => parseRecipe(call, req),
    invalidCode: 'invalid_recipe',
    label: 'receta',
  })
}

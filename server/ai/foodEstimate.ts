import type Anthropic from '@anthropic-ai/sdk'
import {
  DONT_KNOW,
  EstimateToolSchema,
  MAX_QUESTION_ROUNDS,
  MAX_QUESTIONS_PER_ROUND,
  QuestionsToolSchema,
  estimateErrors,
  questionErrors,
  roundsAsked,
  sumEstimate,
  type FoodEstimate,
  type FoodEstimateRequest,
  type FoodQuestions,
} from '../../src/domain/foodEstimateSchema.js'
import type { AiClient } from './claude.js'
import { callToolWithRetry, formatZodIssues, toolFromZod, type ToolParse } from './tools.js'

export const ESTIMATE_TOOL = 'registrar_estimacion'
export const QUESTIONS_TOOL = 'hacer_preguntas'

export const FOOD_SYSTEM = `Eres un dietista-nutricionista que registra comidas en una app de nutrición en España. El usuario describe lo que ha comido con texto, con una foto o con ambos.

Cómo estimas:
- Identifica cada alimento por separado (p. ej. arroz, pollo, ensalada, pan). No inventes alimentos que el usuario no ha mencionado ni se ven en la foto, salvo el aceite, la mantequilla o la salsa probables según la preparación (frito, a la plancha, guiso, aliñado), que sumas a la grasa y las kcal del alimento que los lleva e indicas en "supuesto" (p. ej. "incluye ~1 cucharada de aceite").
- Cantidades: usa los gramos que diga el usuario. Si no, medidas caseras españolas (cucharada ≈ 10 g de aceite, vaso ≈ 200 ml, plato hondo, ración de menú del día, una pieza de fruta mediana…). En una foto, referencias visuales: plato (llano ≈ 26-28 cm, de postre ≈ 20 cm, cuenco ≈ 15 cm), cubiertos (tenedor ≈ 19 cm), la mano, vasos o envases. Gramos del alimento tal y como se come (cocinado si está cocinado).
- Valores nutricionales estándar por 100 g, preferiblemente de bases españolas o europeas (BEDCA, tablas Moreiras, CIQUAL), escalados a los gramos. Las kcal deben cuadrar con los macros (4 kcal/g proteína y carbohidratos, 9 kcal/g grasa).
- Entiendes platos típicos (tortilla de patatas, cocido, lentejas, paella, menú del día…) y marcas comunes de supermercado (Hacendado, Pascual, Danone, Bimbo…).
- "confianza": alta si el alimento y la cantidad son claros; media si dudas de la cantidad o la preparación; baja si dudas de qué es.
- Si lo descrito no es comida, o no se distingue qué es, registra la estimación con "reconocida": false, "items" vacío, totales a 0 y explícalo en "comentario".
- Nombres en español, concretos y reutilizables ("Lentejas estofadas con chorizo", no "Comida").

Preguntas de aclaración (herramienta ${QUESTIONS_TOOL}):
- Pregunta SOLO si la respuesta cambiaría la estimación de forma importante (más de un 20 % de las kcal del plato): cantidad o tamaño de ración desconocidos, forma de cocinado (frito / plancha / horno), salsas o aceite, o versión del producto (normal / light / entero / desnatado).
- Si la descripción ya basta ("200 g de pechuga a la plancha", "un yogur natural"), estima directamente sin preguntar.
- Como mucho ${MAX_QUESTIONS_PER_ROUND} preguntas, todas en una sola tanda. Una segunda tanda solo si una respuesta abre una duda nueva importante; después estima SIEMPRE con supuestos razonables.
- Cada pregunta, breve y con 2-4 opciones cortas típicas con cantidades orientativas (p. ej. "Ración pequeña (~150 g)", "Normal (~250 g)", "Grande (~350 g)"). No añadas "${DONT_KNOW}": lo pone la app.
- Si una respuesta es "${DONT_KNOW}", asume lo más habitual en España y dilo en "supuesto".

Responde SIEMPRE llamando a una herramienta: ${ESTIMATE_TOOL} con la estimación o, solo si hace falta y está disponible, ${QUESTIONS_TOOL}.`

export const estimateTool = () =>
  toolFromZod(ESTIMATE_TOOL, 'Registra la estimación nutricional de lo que ha comido el usuario (también si no es comida: reconocida false).', EstimateToolSchema)
export const questionsTool = () =>
  toolFromZod(QUESTIONS_TOOL, `Hace hasta ${MAX_QUESTIONS_PER_ROUND} preguntas de aclaración, solo si la respuesta cambiaría más de un 20 % las kcal.`, QuestionsToolSchema)

/** Texto para el modelo: descripción, preguntas ya respondidas y si aún puede preguntar. */
export function buildEstimatePrompt(req: FoodEstimateRequest): string {
  const parts: string[] = []
  const description = req.description?.trim()
  if (description) parts.push(`${req.image ? 'Nota del usuario sobre la foto' : 'Lo que ha comido el usuario'}: ${description}`)
  else parts.push('Estima lo que hay en esta foto.')

  const questions = req.previousQuestions ?? []
  if (questions.length) {
    const answers = new Map((req.answers ?? []).map((a) => [a.questionId, a.answer]))
    parts.push(['Preguntas que ya le hiciste y sus respuestas:', ...questions.map((q) => `- ${q.texto} → ${answers.get(q.id) ?? DONT_KNOW}`)].join('\n'))
  }

  const asked = roundsAsked(questions)
  if (asked >= MAX_QUESTION_ROUNDS) parts.push(`Ya no puedes preguntar más: llama a ${ESTIMATE_TOOL} con supuestos razonables.`)
  else if (asked > 0) parts.push(`Estima ya, salvo que una respuesta abra una duda nueva que cambie más de un 20 % las kcal (entonces puedes hacer una última tanda de preguntas).`)
  else parts.push(`Si la descripción basta, estima directamente con ${ESTIMATE_TOOL}.`)
  return parts.join('\n\n')
}

export interface FoodEstimateResult {
  result: FoodEstimate | FoodQuestions
  model: string
  attempts: number
  usage: { input_tokens: number; output_tokens: number }
}


/** Valida la llamada a una de las herramientas. Las preguntas reciben ids r<tanda>q<n>. */
function parseToolCall(call: Anthropic.Beta.BetaToolUseBlock | undefined, round: number, canAsk: boolean): ToolParse<FoodEstimate | FoodQuestions> {
  if (!call || (call.name === QUESTIONS_TOOL && !canAsk)) return { ok: false, errors: [`No llamaste a la herramienta ${ESTIMATE_TOOL}.`] }
  if (call.name === QUESTIONS_TOOL) {
    const parsed = QuestionsToolSchema.safeParse(call.input)
    if (!parsed.success) return { ok: false, errors: formatZodIssues(parsed.error.issues) }
    const errors = questionErrors(parsed.data.questions)
    if (errors.length) return { ok: false, errors }
    const questions = parsed.data.questions.map((q, i) => ({ ...q, id: `r${round}q${i + 1}`, texto: q.texto.trim(), opciones: q.opciones.map((o) => o.trim()) }))
    return { ok: true, value: { type: 'questions', questions } }
  }
  const parsed = EstimateToolSchema.safeParse(call.input)
  if (!parsed.success) return { ok: false, errors: formatZodIssues(parsed.error.issues) }
  const errors = estimateErrors(parsed.data)
  if (errors.length) return { ok: false, errors }
  // Totales siempre coherentes con los items (la suma del modelo puede venir redondeada o mal)
  return { ok: true, value: { type: 'estimate', ...parsed.data, totales: sumEstimate(parsed.data.items) } }
}

/**
 * Estima la comida (texto, foto o ambos) o pide aclaraciones, con tool use. Tras
 * MAX_QUESTION_ROUNDS tandas ya no se ofrece la herramienta de preguntas. Si la llamada no
 * es válida, reintenta UNA vez con los errores (si queda tiempo antes de `deadline`).
 */
export async function estimateFood(
  client: AiClient,
  model: string,
  req: FoodEstimateRequest,
  opts: { deadline: number; now?: () => number },
): Promise<FoodEstimateResult> {
  const round = roundsAsked(req.previousQuestions) + 1
  const canAsk = round <= MAX_QUESTION_ROUNDS
  const tools = canAsk ? [estimateTool(), questionsTool()] : [estimateTool()]
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(req.image ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: req.image } }] : []),
    { type: 'text', text: buildEstimatePrompt(req) },
  ]
  const r = await callToolWithRetry(client, {
    model,
    system: FOOD_SYSTEM,
    content,
    tools,
    effort: 'medium',
    maxTokens: 8000,
    deadline: opts.deadline,
    now: opts.now,
    parse: (call) => parseToolCall(call, round, canAsk),
    invalidCode: 'invalid_estimate',
    label: 'estimación de comida',
  })
  return { result: r.value, model: r.model, attempts: r.attempts, usage: r.usage }
}

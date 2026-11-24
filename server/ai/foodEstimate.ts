import { z } from 'zod'
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
import { modelOptions, type AiClient } from './claude.js'
import { HttpError } from './http.js'

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

/** Esquema JSON de una herramienta desde zod (como betaZodTool del SDK), sin la clave $schema. */
function toolFromZod(name: string, description: string, schema: z.ZodType): Anthropic.Beta.BetaTool {
  const { $schema: _dialect, ...input } = z.toJSONSchema(schema, { reused: 'ref' })
  return { name, description, input_schema: input as Anthropic.Beta.BetaTool['input_schema'] }
}

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

const formatZodIssues = (issues: { path: PropertyKey[]; message: string }[]) => issues.slice(0, 10).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)

type Parsed = { ok: true; result: FoodEstimate | FoodQuestions } | { ok: false; errors: string[] }

/** Valida la llamada a una de las herramientas. Las preguntas reciben ids r<tanda>q<n>. */
function parseToolCall(call: Anthropic.Beta.BetaToolUseBlock | undefined, round: number, canAsk: boolean): Parsed {
  if (!call || (call.name === QUESTIONS_TOOL && !canAsk)) return { ok: false, errors: [`No llamaste a la herramienta ${ESTIMATE_TOOL}.`] }
  if (call.name === QUESTIONS_TOOL) {
    const parsed = QuestionsToolSchema.safeParse(call.input)
    if (!parsed.success) return { ok: false, errors: formatZodIssues(parsed.error.issues) }
    const errors = questionErrors(parsed.data.questions)
    if (errors.length) return { ok: false, errors }
    const questions = parsed.data.questions.map((q, i) => ({ ...q, id: `r${round}q${i + 1}`, texto: q.texto.trim(), opciones: q.opciones.map((o) => o.trim()) }))
    return { ok: true, result: { type: 'questions', questions } }
  }
  const parsed = EstimateToolSchema.safeParse(call.input)
  if (!parsed.success) return { ok: false, errors: formatZodIssues(parsed.error.issues) }
  const errors = estimateErrors(parsed.data)
  if (errors.length) return { ok: false, errors }
  // Totales siempre coherentes con los items (la suma del modelo puede venir redondeada o mal)
  return { ok: true, result: { type: 'estimate', ...parsed.data, totales: sumEstimate(parsed.data.items) } }
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
  const now = opts.now ?? Date.now
  const round = roundsAsked(req.previousQuestions) + 1
  const canAsk = round <= MAX_QUESTION_ROUNDS
  const tools = canAsk ? [estimateTool(), questionsTool()] : [estimateTool()]
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(req.image ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: req.image } }] : []),
    { type: 'text', text: buildEstimatePrompt(req) },
  ]
  const usage = { input_tokens: 0, output_tokens: 0 }
  let errors: string[] = []
  let previous = ''

  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = opts.deadline - now()
    if (attempt === 2 && remaining < 15_000) break
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      {
        role: 'user',
        content:
          attempt === 1
            ? content
            : [...content, { type: 'text', text: `Tu respuesta anterior no era válida. Corrige estos errores y llama otra vez a una herramienta con la respuesta completa:\n- ${errors.join('\n- ')}\n\nRespuesta anterior:\n${previous}` }],
      },
    ]

    const response = await client.beta.messages.create(
      {
        model,
        // Holgura para el razonamiento (Sonnet 5.5 piensa por defecto y cuenta en max_tokens)
        max_tokens: 8000,
        system: FOOD_SYSTEM,
        messages,
        // tool_choice "auto" (por defecto): Sonnet/Opus 5.5 y Fable 5.1+ rechazan con 400 el uso
        // forzado ({type: "tool"} / "any"). El prompt pide la llamada; si no llega, se reintenta.
        tools,
        ...modelOptions(model, 'medium'),
      },
      { timeout: Math.max(5_000, Math.min(45_000, remaining - 2_000)), maxRetries: 0 },
    )
    usage.input_tokens += response.usage.input_tokens
    usage.output_tokens += response.usage.output_tokens
    if (response.stop_reason === 'refusal') throw new HttpError('refused', 422)

    const call = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && (b.name === ESTIMATE_TOOL || b.name === QUESTIONS_TOOL))
    previous = JSON.stringify(call ? { herramienta: call.name, entrada: call.input } : null).slice(0, 4000)
    if (response.stop_reason === 'max_tokens') {
      errors = ['La respuesta se cortó por longitud: sé más conciso y devuelve la respuesta completa.']
      continue
    }
    const parsed = parseToolCall(call, round, canAsk)
    if (parsed.ok) return { result: parsed.result, model: response.model, attempts: attempt, usage }
    errors = parsed.errors
  }
  console.error('[ai] estimación de comida inválida tras reintento:', errors)
  throw new HttpError('invalid_estimate', 502)
}

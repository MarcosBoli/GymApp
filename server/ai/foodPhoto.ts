import { z } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'
import {
  FoodPhotoEstimateSchema,
  foodPhotoErrors,
  sumEstimate,
  type FoodPhotoEstimate,
  type FoodPhotoRequest,
} from '../../src/domain/foodPhotoSchema.js'
import { modelOptions, type AiClient } from './claude.js'
import { HttpError } from './http.js'

export const FOOD_SYSTEM = `Eres un dietista-nutricionista que estima lo que hay en una foto de comida para registrarlo en una app de nutrición en España.

Cómo estimas:
- Identifica cada alimento VISIBLE por separado (p. ej. arroz, pollo, ensalada, pan). No inventes alimentos que no se ven; si algo está tapado o no se distingue, dilo en la nota en vez de suponerlo.
- Estima los gramos con referencias visuales: tamaño del plato (llano ≈ 26-28 cm, de postre ≈ 20 cm, cuenco ≈ 15 cm), cubiertos (tenedor ≈ 19 cm, cuchara sopera ≈ 15 ml), la mano, vasos, envases o el propio tamaño típico de las piezas. Gramos del alimento tal y como se come (cocinado si está cocinado).
- Ten en cuenta el aceite, la mantequilla o las salsas probables según la preparación (frito, a la plancha, guiso, aliñado) y súmalos a la grasa y las kcal del alimento que los lleva, indicándolo en "nota" (p. ej. "incluye ~1 cucharada de aceite").
- Usa valores nutricionales estándar por 100 g, preferiblemente de bases de datos españolas o europeas (BEDCA, tablas Moreiras, CIQUAL) y escálalos a los gramos estimados. Las kcal deben cuadrar con los macros (4 kcal/g proteína y carbohidratos, 9 kcal/g grasa).
- "confianza": alta si el alimento y la cantidad son claros; media si dudas de la cantidad o la preparación; baja si dudas de qué es.
- Si la nota del usuario aporta datos (cantidades, ingredientes, marca, cómo se cocinó), dales prioridad sobre lo que deduzcas de la foto.
- Si la foto no es comida, o no se distingue lo que hay, pon "reconocida": false, "items" vacío, totales a 0 y explícalo en "comentario".
- Nombres en español, concretos y reutilizables ("Lentejas estofadas con chorizo", no "Comida").
- "comentario": 1-2 frases con lo que ves y los supuestos principales.

Responde SIEMPRE llamando a la herramienta registrar_estimacion.`

export const FOOD_TOOL_NAME = 'registrar_estimacion'

/** Herramienta cuya entrada es la estimación (esquema JSON generado desde zod, como betaZodTool del SDK). */
export function foodTool(): Anthropic.Beta.BetaTool {
  // Sin la clave $schema: es metadato del dialecto y la API no la necesita
  const { $schema: _dialect, ...schema } = z.toJSONSchema(FoodPhotoEstimateSchema, { reused: 'ref' })
  return {
    name: FOOD_TOOL_NAME,
    description: 'Registra la estimación nutricional de los alimentos visibles en la foto. Llámala siempre, una vez, con la estimación completa (también si la foto no es comida: reconocida false).',
    input_schema: schema as Anthropic.Beta.BetaTool['input_schema'],
  }
}

export interface FoodPhotoResult {
  estimate: FoodPhotoEstimate
  model: string
  attempts: number
  usage: { input_tokens: number; output_tokens: number }
}

const formatZodIssues = (issues: { path: PropertyKey[]; message: string }[]) => issues.slice(0, 10).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)

/**
 * Estima la comida de la foto con tool use y valida la entrada de la herramienta
 * con zod + reglas de coherencia. Si no es válida, reintenta UNA vez explicando los errores
 * (si queda tiempo antes de `deadline`; la función tiene 60 s).
 */
export async function estimateFoodPhoto(
  client: AiClient,
  model: string,
  req: FoodPhotoRequest,
  opts: { deadline: number; now?: () => number },
): Promise<FoodPhotoResult> {
  const now = opts.now ?? Date.now
  const note = req.note?.trim()
  const userContent: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: req.image } },
    { type: 'text', text: `${note ? `Nota del usuario: ${note}\n\n` : ''}Estima lo que hay en esta foto y llama a la herramienta ${FOOD_TOOL_NAME} con la estimación.` },
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
            ? userContent
            : [...userContent, { type: 'text', text: `Tu estimación anterior no era válida. Corrige estos errores y llama otra vez a la herramienta con la estimación completa:\n- ${errors.join('\n- ')}\n\nEstimación anterior:\n${previous}` }],
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
        tools: [foodTool()],
        ...modelOptions(model, 'medium'),
      },
      { timeout: Math.max(5_000, Math.min(45_000, remaining - 2_000)), maxRetries: 0 },
    )
    usage.input_tokens += response.usage.input_tokens
    usage.output_tokens += response.usage.output_tokens
    if (response.stop_reason === 'refusal') throw new HttpError('refused', 422)

    const call = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === FOOD_TOOL_NAME)
    previous = JSON.stringify(call?.input ?? null).slice(0, 4000)
    if (response.stop_reason === 'max_tokens') {
      errors = ['La respuesta se cortó por longitud: notas más breves y la estimación completa.']
      continue
    }
    if (!call) {
      errors = [`No llamaste a la herramienta ${FOOD_TOOL_NAME}.`]
      continue
    }
    const parsed = FoodPhotoEstimateSchema.safeParse(call.input)
    if (!parsed.success) {
      errors = formatZodIssues(parsed.error.issues)
      continue
    }
    errors = foodPhotoErrors(parsed.data)
    if (errors.length === 0) {
      // Totales siempre coherentes con los items (la suma del modelo puede venir redondeada o mal)
      return { estimate: { ...parsed.data, totales: sumEstimate(parsed.data.items) }, model: response.model, attempts: attempt, usage }
    }
  }
  console.error('[ai] estimación de foto inválida tras reintento:', errors)
  throw new HttpError('invalid_estimate', 502)
}

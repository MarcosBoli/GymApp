import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { planErrors, planOutputSchema, type PlanOutput, type PlanRequest } from '../../src/domain/planSchema.js'
import { supportsServerFallback, type AiClient } from './claude.js'
import { HttpError } from './http.js'

export const PLAN_SYSTEM = `Eres un entrenador personal que diseña rutinas semanales de fuerza e hipertrofia basadas en la evidencia.
Diseñas la semana para la persona del contexto (JSON) usando SOLO ejercicios del catálogo (por su id).

Principios:
- Volumen: 10-20 series efectivas por músculo y semana (las de músculo secundario cuentan la mitad). Si el músculo tiene "weeklySets" bajo, sube de forma gradual.
- Frecuencia: cada músculo 2 veces por semana cuando los días disponibles lo permitan.
- Orden: compuestos multiarticulares primero, aislamientos después.
- Prioriza el eslabón débil (weakLink) con algo más de volumen o colocándolo al principio de la sesión, sin descuidar el resto.
- Sobrecarga progresiva: rangos de repeticiones y RPE que permitan progresar. Para fuerza, más trabajo en 3-6 reps; para hipertrofia, sobre todo 6-15; para recomposición, mezcla.
- Descarga (menos series y RPE 6-7) si varios músculos llevan semanas estancados (e1rmTrend4wPct ≤ 0) o la semana anterior fue "hard" / la adherencia fue baja por fatiga. Si fue "easy", puedes subir algo el volumen o el RPE.
- Respeta las limitaciones del usuario: evita ejercicios que las agraven y elige alternativas del catálogo.
- Ajusta el número de ejercicios y series a la duración de la sesión (≈ 2-3 min por serie incluido el descanso).
- Exactamente profile.daysPerWeek días, repartidos en la semana (dayIndex 0 = lunes … 6 = domingo) con descanso entre sesiones exigentes.
- No indiques pesos: la app los calcula a partir del e1RM. Usa rpeTarget (5-10) y el rango de repeticiones.
- "reasoning": 2-4 frases en español explicando el enfoque de la semana. Notas de ejercicio breves y en español, o cadena vacía.`

export interface PlanGenerationResult {
  plan: PlanOutput
  model: string
  attempts: number
  usage: { input_tokens: number; output_tokens: number }
}

/** Mensaje de usuario: contexto + catálogo compacto (una línea por ejercicio). */
export function buildPlanPrompt(req: PlanRequest): string {
  const catalog = req.catalog
    .map((c) => `${c.id} | ${c.name} | principales: ${c.primary.join(', ') || '—'} | secundarios: ${c.secondary.join(', ') || '—'}`)
    .join('\n')
  return `Genera mi rutina para la semana que empieza el lunes ${req.context.weekStart}.

Contexto (JSON):
${JSON.stringify(req.context)}

Catálogo (id | nombre | músculos):
${catalog}`
}

const formatZodIssues = (issues: { path: PropertyKey[]; message: string }[]) => issues.slice(0, 10).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)

/**
 * Genera el plan con salida estructurada y lo valida con zod + reglas del catálogo.
 * Si no es válido, reintenta UNA vez explicando los errores, siempre que quede tiempo
 * antes de `deadline` (la función tiene 60 s en total).
 */
export async function generatePlan(
  client: AiClient,
  model: string,
  req: PlanRequest,
  opts: { deadline: number; now?: () => number },
): Promise<PlanGenerationResult> {
  const now = opts.now ?? Date.now
  const ids = req.catalog.map((c) => c.id) as [string, ...string[]]
  const schema = planOutputSchema(ids)
  const idSet = new Set(ids)
  const basePrompt = buildPlanPrompt(req)
  const usage = { input_tokens: 0, output_tokens: 0 }
  let errors: string[] = []
  let previous = ''

  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = opts.deadline - now()
    if (attempt === 2 && remaining < 15_000) break
    const content =
      attempt === 1
        ? basePrompt
        : `${basePrompt}\n\nTu propuesta anterior no era válida. Corrige estos errores y devuelve el plan completo:\n- ${errors.join('\n- ')}\n\nPropuesta anterior:\n${previous}`

    const response = await client.beta.messages.create(
      {
        model,
        max_tokens: 8000,
        system: PLAN_SYSTEM,
        messages: [{ role: 'user', content }],
        output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
        ...(supportsServerFallback(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      { timeout: Math.max(5_000, Math.min(45_000, remaining - 2_000)), maxRetries: 0 },
    )
    usage.input_tokens += response.usage.input_tokens
    usage.output_tokens += response.usage.output_tokens
    if (response.stop_reason === 'refusal') throw new HttpError('refused', 422)

    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    previous = text.slice(0, 6000)
    if (response.stop_reason === 'max_tokens') {
      errors = ['La respuesta se cortó por longitud: sé más conciso (notas breves) y devuelve el JSON completo.']
      continue
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      errors = ['La respuesta no era JSON válido.']
      continue
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      errors = formatZodIssues(parsed.error.issues)
      continue
    }
    errors = planErrors(parsed.data, idSet, req.context.profile.daysPerWeek)
    if (errors.length === 0) return { plan: parsed.data, model: response.model, attempts: attempt, usage }
  }
  console.error('[ai] plan inválido tras reintento:', errors)
  throw new HttpError('invalid_plan', 502)
}

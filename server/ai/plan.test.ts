import { describe, expect, it, vi } from 'vitest'
import { generatePlan, buildPlanPrompt } from './plan.js'
import { createAiHandlers, SECRET_HEADER } from './handlers.js'
import type { AiClient } from './claude.js'
import type { CoachContext, PlanRequest } from '../../src/domain/planSchema.js'

const context: CoachContext = {
  weekStart: '2026-11-23',
  profile: { sex: 'male', age: 31, heightCm: 180, weightKg: 80, trainingGoal: 'hypertrophy', daysPerWeek: 2, sessionMinutes: 60, equipment: ['barbell'], limitations: 'hombro derecho' },
  muscles: [{ id: 'chest', name: 'Pecho', rank: 'Atleta II', lp: 40, e1rmTrend4wPct: 2.5, weeklySets: 9, daysSinceLast: 2 }],
  weakLink: { id: 'chest', name: 'Pecho', rank: 'Atleta II' },
  lastWeek: { planned: 2, completed: 2, adherence: 1, rating: 'ok' },
}
const catalog = [
  { id: 'bench_press', name: 'Press de banca', equipment: 'barbell', primary: ['Pecho'], secondary: ['Tríceps'] },
  { id: 'back_squat', name: 'Sentadilla', equipment: 'barbell', primary: ['Cuádriceps', 'Glúteo'], secondary: [] },
  { id: 'pull_up', name: 'Dominadas', equipment: 'bodyweight', primary: ['Dorsal'], secondary: ['Bíceps'] },
]
const req: PlanRequest = { context, catalog }

const ex = (exerciseId: string) => ({ exerciseId, sets: 3, repsMin: 8, repsMax: 10, rpeTarget: 8, notes: '' })
const validPlan = { reasoning: 'Semana de acumulación.', days: [{ dayIndex: 0, name: 'Torso', exercises: [ex('bench_press'), ex('pull_up')] }, { dayIndex: 3, name: 'Pierna', exercises: [ex('back_squat')] }] }

function client(...replies: (object | string)[]) {
  const create = vi.fn(async () => {
    const r = replies.shift()!
    const isText = typeof r === 'string'
    const body = isText ? { text: r } : r
    return {
      model: 'claude-sonnet-5-5',
      stop_reason: (body as { stop_reason?: string }).stop_reason ?? 'end_turn',
      content: 'text' in body ? [{ type: 'text', text: (body as { text: string }).text }] : [{ type: 'text', text: JSON.stringify(body) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }
  })
  return { client: { beta: { messages: { create } }, models: { retrieve: vi.fn() } } as unknown as AiClient, create }
}
type Params = { model: string; system: string; output_config: { effort: string; format: { type: string; schema: Record<string, unknown> } }; messages: { content: string }[]; fallbacks?: string; betas?: string[] }
const params = (create: ReturnType<typeof vi.fn>, i = 0) => (create.mock.calls[i] as unknown as [Params, { timeout: number }])

describe('generatePlan', () => {
  const deadline = () => Date.now() + 57_000

  it('plan válido al primer intento con salida estructurada (ids del catálogo como enum)', async () => {
    const { client: c, create } = client(validPlan)
    const r = await generatePlan(c, 'claude-sonnet-5-5', req, { deadline: deadline() })
    expect(r).toEqual({ plan: validPlan, model: 'claude-sonnet-5-5', attempts: 1, usage: { input_tokens: 100, output_tokens: 50 } })
    const [p, o] = params(create)
    expect(p.output_config.effort).toBe('medium')
    expect(p.output_config.format.type).toBe('json_schema')
    expect(JSON.stringify(p.output_config.format.schema)).toContain('"enum":["bench_press","back_squat","pull_up"]')
    expect(p).toMatchObject({ fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] })
    expect(o.timeout).toBeLessThanOrEqual(45_000)
    expect(p.system).toContain('10-20 series efectivas')
  })

  it('exerciseId inexistente → reintenta una vez diciéndole el error', async () => {
    const bad = { ...validPlan, days: [{ ...validPlan.days[0]!, exercises: [ex('press_militar_inventado')] }, validPlan.days[1]!] }
    const { client: c, create } = client(bad, validPlan)
    const r = await generatePlan(c, 'claude-sonnet-5-5', req, { deadline: deadline() })
    expect(r.attempts).toBe(2)
    expect(r.usage).toEqual({ input_tokens: 200, output_tokens: 100 })
    const retry = params(create, 1)[0].messages[0]!.content
    expect(retry).toContain('Tu propuesta anterior no era válida')
    expect(retry).toContain('exerciseId')
    expect(retry).toContain('press_militar_inventado')
  })

  it('reglas que el esquema no expresa (nº de días) también provocan el reintento', async () => {
    const oneDay = { ...validPlan, days: [validPlan.days[0]!] }
    const { client: c, create } = client(oneDay, validPlan)
    await generatePlan(c, 'claude-sonnet-5-5', req, { deadline: deadline() })
    expect(params(create, 1)[0].messages[0]!.content).toContain('2 días por semana y el plan tiene 1')
  })

  it('JSON roto o respuesta cortada → reintento', async () => {
    const { client: c } = client('{"reasoning":', validPlan)
    expect((await generatePlan(c, 'claude-sonnet-5-5', req, { deadline: deadline() })).attempts).toBe(2)
    const { client: c2, create } = client({ text: '{"days":[', stop_reason: 'max_tokens' }, validPlan)
    await generatePlan(c2, 'claude-sonnet-5-5', req, { deadline: deadline() })
    expect(params(create, 1)[0].messages[0]!.content).toContain('se cortó por longitud')
  })

  it('dos respuestas inválidas → error invalid_plan (sin tercer intento)', async () => {
    const { client: c, create } = client('{}', '{}', validPlan)
    await expect(generatePlan(c, 'claude-sonnet-5-5', req, { deadline: deadline() })).rejects.toMatchObject({ code: 'invalid_plan', status: 502 })
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('sin tiempo para reintentar (función de 60 s) → no reintenta', async () => {
    let t = 0
    const { client: c, create } = client('{}', validPlan)
    const now = () => t
    create.mockImplementationOnce(async () => {
      t = 50_000 // el primer intento tardó 50 s
      return { model: 'm', stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } }
    })
    await expect(generatePlan(c, 'claude-sonnet-5-5', req, { deadline: 57_000, now })).rejects.toMatchObject({ code: 'invalid_plan' })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('negativa del modelo → refused', async () => {
    const { client: c } = client({ text: '', stop_reason: 'refusal' })
    await expect(generatePlan(c, 'claude-sonnet-5-5', req, { deadline: deadline() })).rejects.toMatchObject({ code: 'refused' })
  })

  it('el prompt incluye semana, contexto y catálogo compacto', () => {
    const p = buildPlanPrompt(req)
    expect(p).toContain('lunes 2026-11-23')
    expect(p).toContain('"limitations":"hombro derecho"')
    expect(p).toContain('bench_press | Press de banca | principales: Pecho | secundarios: Tríceps')
  })
})

describe('POST /api/plan', () => {
  const ENV = { ANTHROPIC_API_KEY: 'k', APP_SECRET: 's' }
  const post = (body: unknown) => new Request('https://x/api/plan', { method: 'POST', headers: { [SECRET_HEADER]: 's', 'content-type': 'application/json' }, body: JSON.stringify(body) })

  it('contexto + catálogo válidos → plan', async () => {
    const { client: c } = client(validPlan)
    const res = await createAiHandlers({ env: ENV, makeClient: () => c }).plan(post(req))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { plan: unknown }).plan).toEqual(validPlan)
  })

  it('cuerpo que no cumple el esquema → 400 sin llamar a la IA', async () => {
    const { client: c, create } = client(validPlan)
    const res = await createAiHandlers({ env: ENV, makeClient: () => c }).plan(post({ context: { ...context, profile: { ...context.profile, daysPerWeek: 9 } }, catalog }))
    expect(res.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it('plan inválido dos veces → 502 con mensaje claro', async () => {
    const { client: c } = client('{}', '{}')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await createAiHandlers({ env: ENV, makeClient: () => c }).plan(post(req))
    spy.mockRestore()
    expect(res.status).toBe(502)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_plan')
  })
})

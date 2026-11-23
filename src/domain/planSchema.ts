/**
 * Contrato de la rutina semanal con IA (zod), compartido por la app y la función /api/plan.
 * Sin imports relativos: el servidor lo carga como ESM de Node.
 */
import { z } from 'zod'

export const TRAINING_GOALS = ['strength', 'hypertrophy', 'recomp'] as const
export const PLAN_EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'] as const
export const WEEK_RATINGS = ['hard', 'ok', 'easy'] as const

export type TrainingGoal = (typeof TRAINING_GOALS)[number]
export type PlanEquipment = (typeof PLAN_EQUIPMENT)[number]
export type WeekRating = (typeof WEEK_RATINGS)[number]

// ─── Petición: contexto del usuario + catálogo ─────────────────────────────

export const MuscleContextSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** "Oro II", "Maestro"… o null si no tiene rango. */
  rank: z.string().nullable(),
  lp: z.number().nullable(),
  /** Cambio % del mejor e1RM (últimas 2 semanas frente a las 2 anteriores). */
  e1rmTrend4wPct: z.number().nullable(),
  /** Series efectivas medias por semana (últimas 4 semanas). */
  weeklySets: z.number(),
  daysSinceLast: z.number().nullable(),
})

export const CoachContextSchema = z.object({
  weekStart: z.string(),
  profile: z.object({
    sex: z.enum(['male', 'female']),
    age: z.number().nullable(),
    heightCm: z.number(),
    weightKg: z.number().nullable(),
    trainingGoal: z.enum(TRAINING_GOALS),
    daysPerWeek: z.number().int().min(1).max(7),
    sessionMinutes: z.number().int().min(15).max(240),
    equipment: z.array(z.enum(PLAN_EQUIPMENT)),
    limitations: z.string().max(500),
  }),
  muscles: z.array(MuscleContextSchema).max(30),
  weakLink: z.object({ id: z.string(), name: z.string(), rank: z.string() }).nullable(),
  lastWeek: z.object({
    planned: z.number().int().nullable(),
    completed: z.number().int(),
    adherence: z.number().nullable(),
    rating: z.enum(WEEK_RATINGS).nullable(),
  }),
})
export type CoachContext = z.infer<typeof CoachContextSchema>

export const CatalogItemSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  equipment: z.string(),
  primary: z.array(z.string()),
  secondary: z.array(z.string()),
})
export type CatalogItem = z.infer<typeof CatalogItemSchema>

export const PlanRequestSchema = z.object({
  context: CoachContextSchema,
  catalog: z.array(CatalogItemSchema).min(3).max(200),
})
export type PlanRequest = z.infer<typeof PlanRequestSchema>

// ─── Respuesta del modelo ──────────────────────────────────────────────────

/**
 * Esquema de salida. Con `exerciseIds`, exerciseId es un enum del catálogo (la salida
 * estructurada ya impide inventarse ejercicios). Los min/max los valida el SDK en cliente.
 */
export function planOutputSchema(exerciseIds?: readonly [string, ...string[]]) {
  const exerciseId = exerciseIds ? z.enum(exerciseIds) : z.string()
  return z.object({
    reasoning: z.string().describe('Razonamiento breve de la semana (2-4 frases, en español).'),
    days: z
      .array(
        z.object({
          dayIndex: z.number().int().min(0).max(6).describe('0 = lunes … 6 = domingo'),
          name: z.string().describe('Nombre corto del día, p. ej. "Torso A"'),
          exercises: z
            .array(
              z.object({
                exerciseId: exerciseId.describe('id exacto del catálogo'),
                sets: z.number().int().min(1).max(8),
                repsMin: z.number().int().min(1).max(30),
                repsMax: z.number().int().min(1).max(30),
                rpeTarget: z.number().min(5).max(10),
                notes: z.string().describe('Indicación breve o cadena vacía'),
              }),
            )
            .min(1)
            .max(12),
        }),
      )
      .min(1)
      .max(7),
  })
}
export type PlanOutput = z.infer<ReturnType<typeof planOutputSchema>>

// ─── Reglas que el esquema no expresa (las comprueba el servidor y reintenta) ─

/**
 * Errores del plan frente al catálogo y al perfil, redactados para devolvérselos al
 * modelo en el reintento. Vacío = plan válido.
 */
export function planErrors(plan: PlanOutput, catalogIds: ReadonlySet<string>, daysPerWeek: number): string[] {
  const errors: string[] = []
  const unknown = [...new Set(plan.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)).filter((id) => !catalogIds.has(id)))]
  if (unknown.length) errors.push(`Estos exerciseId no existen en el catálogo: ${unknown.join(', ')}. Usa solo ids del catálogo.`)
  const indexes = plan.days.map((d) => d.dayIndex)
  if (new Set(indexes).size !== indexes.length) errors.push('Hay días repetidos (dayIndex duplicado). Cada día de la semana solo una vez.')
  if (plan.days.length !== daysPerWeek) errors.push(`El usuario entrena ${daysPerWeek} días por semana y el plan tiene ${plan.days.length}.`)
  for (const d of plan.days) {
    for (const e of d.exercises) {
      if (e.repsMin > e.repsMax) errors.push(`${d.name}: ${e.exerciseId} tiene repsMin (${e.repsMin}) mayor que repsMax (${e.repsMax}).`)
    }
    const ids = d.exercises.map((e) => e.exerciseId)
    if (new Set(ids).size !== ids.length) errors.push(`${d.name}: ejercicios repetidos en el mismo día.`)
  }
  return errors
}


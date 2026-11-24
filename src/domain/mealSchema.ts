/**
 * Recomendador de comidas y recetas con IA (/api/meal-suggestions y /api/recipe): preferencias,
 * contexto, opciones, receta y reglas de coherencia. Solo importa zod: lo usan también las
 * funciones del servidor. Claves en español (las ve el modelo).
 */
import { z } from 'zod'

export const DIETS = ['omnivora', 'vegetariana', 'vegana', 'pescetariana'] as const
export const BUDGETS = ['bajo', 'medio'] as const
export const UTENSILS = ['sarten', 'horno', 'microondas', 'airfryer'] as const
export type Diet = (typeof DIETS)[number]
export type Budget = (typeof BUDGETS)[number]
export type Utensil = (typeof UTENSILS)[number]

export const MEAL_IDS = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export const MEAL_GOALS = ['deficit', 'mantenimiento', 'superavit'] as const
export const SUGGESTION_KINDS = ['sencilla', 'elaborada'] as const
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number]
export const DIFFICULTIES = ['facil', 'media', 'dificil'] as const

/** Límites de las opciones (las reglas del enunciado). */
export const SIMPLE_MAX_MIN = 15
export const SIMPLE_MAX_INGREDIENTS = 6
export const ELABORATE_MAX_MIN = 45
export const OPTIONS_PER_KIND = 3

const kcalAbs = z.number().min(-20000).max(20000)
const gramsAbs = z.number().min(-2000).max(2000)
export const MacrosSchema = z.object({ kcal: kcalAbs, proteina: gramsAbs, carbohidratos: gramsAbs, grasa: gramsAbs })
export type Macros = z.infer<typeof MacrosSchema>

export const MealPrefsSchema = z.object({
  noLeGusta: z.string().max(300),
  dieta: z.enum(DIETS),
  presupuesto: z.enum(BUDGETS),
  utensilios: z.array(z.enum(UTENSILS)).min(1),
  tiempoMaxMin: z.number().int().min(5).max(180),
})
export type MealPrefs = z.infer<typeof MealPrefsSchema>

export const MealSuggestContextSchema = z.object({
  comida: z.enum(MEAL_IDS),
  objetivo: z.enum(MEAL_GOALS),
  /** Lo que queda del día (objetivo − registrado); puede ser negativo. */
  quedaHoy: MacrosSchema,
  /** Parte de lo que queda que corresponde a esta comida. */
  objetivoComida: MacrosSchema,
  /** Queda muy poco o nada: opciones ligeras. */
  ligera: z.boolean(),
  preferencias: MealPrefsSchema,
  ultimasComidas: z.array(z.string().max(80)).max(40),
  peticion: z.string().max(200).optional(),
})
export type MealSuggestContext = z.infer<typeof MealSuggestContextSchema>

export const MealSuggestRequestSchema = z.object({
  context: MealSuggestContextSchema,
  /** Nombres ya vistos ("Otras opciones"): no repetirlos. */
  excluir: z.array(z.string().max(80)).max(60).optional(),
})
export type MealSuggestRequest = z.infer<typeof MealSuggestRequestSchema>

const nonNeg = (max: number) => z.number().min(0).max(max)

export const SuggestionSchema = z.object({
  id: z.string().min(1).max(40).describe('Identificador corto y único'),
  nombre: z.string().min(2).max(80).describe('Nombre del plato en español'),
  tipo: z.enum(SUGGESTION_KINDS),
  descripcion: z.string().min(3).max(200).describe('1 frase'),
  tiempoMin: z.number().int().min(1).max(120).describe('Minutos totales de preparación'),
  dificultad: z.enum(DIFFICULTIES),
  raciones: z.literal(1),
  gramosRacion: z.number().min(20).max(1500).describe('Peso aproximado de la ración servida, en gramos'),
  kcal: nonNeg(3000),
  proteina: nonNeg(300),
  carbohidratos: nonNeg(400),
  grasa: nonNeg(200),
  ingredientesClave: z.array(z.string().min(1).max(40)).min(1).max(12),
  porQueEncaja: z.string().min(3).max(200).describe('1 frase: cómo encaja con lo que le queda hoy'),
})
export type Suggestion = z.infer<typeof SuggestionSchema>

/** Una llamada por tipo (en paralelo): 3 opciones del tipo pedido. */
export const SuggestionsToolSchema = z.object({
  opciones: z.array(SuggestionSchema).length(OPTIONS_PER_KIND).describe('Exactamente 3 opciones del tipo pedido'),
})

export interface MealSuggestionsResponse {
  opciones: Suggestion[]
  /** Si una de las dos tandas falló: se muestran las que sí llegaron. */
  aviso?: string
  model: string
}

const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** ¿kcal coherentes con los macros (4/4/9) dentro de `tolerance` (fracción)? */
export function macrosCoherent(m: { kcal: number; proteina: number; carbohidratos: number; grasa: number }, tolerance: number): boolean {
  const fromMacros = m.proteina * 4 + m.carbohidratos * 4 + m.grasa * 9
  return Math.abs(m.kcal - fromMacros) <= Math.max(15, tolerance * Math.max(m.kcal, fromMacros))
}

/** Tiempo máximo de las elaboradas: el de las reglas, sin pasar del que prefiere el usuario (mín. 15). */
export const elaborateMaxMin = (prefMax: number): number => Math.min(ELABORATE_MAX_MIN, Math.max(SIMPLE_MAX_MIN, prefMax))

/**
 * Reglas que el esquema no expresa (vacío = válidas). Con `kind`: una tanda de 3 de ese tipo;
 * sin él: las 6 juntas (3 sencillas + 3 elaboradas).
 */
export function suggestionErrors(opciones: readonly Suggestion[], opts: { tiempoMaxMin: number; excluir?: readonly string[]; kind?: SuggestionKind }): string[] {
  const errors: string[] = []
  const simple = opciones.filter((o) => o.tipo === 'sencilla')
  if (opts.kind) {
    const wrong = opciones.filter((o) => o.tipo !== opts.kind).length
    if (opciones.length !== OPTIONS_PER_KIND || wrong) errors.push(`Tienen que ser exactamente ${OPTIONS_PER_KIND} opciones de tipo "${opts.kind}" (hay ${opciones.length}, ${wrong} de otro tipo).`)
  } else if (simple.length !== OPTIONS_PER_KIND || opciones.length - simple.length !== OPTIONS_PER_KIND) {
    errors.push(`Tienen que ser exactamente ${OPTIONS_PER_KIND} sencillas y ${OPTIONS_PER_KIND} elaboradas (hay ${simple.length} sencillas y ${opciones.length - simple.length} elaboradas).`)
  }
  const maxElaborate = elaborateMaxMin(opts.tiempoMaxMin)
  const excluded = new Set((opts.excluir ?? []).map(norm))
  const seen = new Set<string>()
  for (const [i, o] of opciones.entries()) {
    const tag = `opciones[${i}] (${o.nombre})`
    if (!macrosCoherent(o, 0.1)) errors.push(`${tag}: kcal ${o.kcal} no cuadra con los macros (${Math.round(o.proteina * 4 + o.carbohidratos * 4 + o.grasa * 9)} kcal con 4/4/9, tolerancia 10 %).`)
    if (o.tipo === 'sencilla' && o.tiempoMin > SIMPLE_MAX_MIN) errors.push(`${tag}: una sencilla no puede pasar de ${SIMPLE_MAX_MIN} min.`)
    if (o.tipo === 'sencilla' && o.ingredientesClave.length > SIMPLE_MAX_INGREDIENTS) errors.push(`${tag}: una sencilla tiene como mucho ${SIMPLE_MAX_INGREDIENTS} ingredientes.`)
    if (o.tipo === 'elaborada' && o.tiempoMin > maxElaborate) errors.push(`${tag}: una elaborada no puede pasar de ${maxElaborate} min.`)
    const key = norm(o.nombre)
    if (seen.has(key)) errors.push(`${tag}: nombre repetido.`)
    if (excluded.has(key)) errors.push(`${tag}: ya se la propusiste antes, propón otra.`)
    seen.add(key)
  }
  return errors
}

// ─── Receta ────────────────────────────────────────────────────────────────

export const RecipeIngredientSchema = z.object({
  nombre: z.string().min(1).max(60),
  gramos: z.number().gt(0).max(2000).describe('Gramos del ingrediente tal y como se compra/pesa'),
  medidaCasera: z.string().max(40).optional().describe('Medida casera española opcional (p. ej. "1 cucharada")'),
  kcal: nonNeg(3000).describe('kcal de esos gramos'),
  proteina: nonNeg(300),
  carbohidratos: nonNeg(400),
  grasa: nonNeg(200),
})
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>

export const RecipeToolSchema = z.object({
  nombre: z.string().min(2).max(80),
  raciones: z.literal(1),
  tiempoTotal: z.number().int().min(1).max(240).describe('Minutos totales'),
  ingredientes: z.array(RecipeIngredientSchema).min(1).max(20),
  pasos: z.array(z.object({ texto: z.string().min(3).max(400), minutos: z.number().int().min(1).max(240).optional() })).min(1).max(15),
  consejos: z.array(z.string().min(3).max(200)).max(5).optional(),
  kcal: nonNeg(3000),
  proteina: nonNeg(300),
  carbohidratos: nonNeg(400),
  grasa: nonNeg(200),
})
export type Recipe = z.infer<typeof RecipeToolSchema>

export const RecipeRequestSchema = z.object({ opcion: SuggestionSchema, preferencias: MealPrefsSchema })
export type RecipeRequest = z.infer<typeof RecipeRequestSchema>

export interface RecipeResponse {
  receta: Recipe
  model: string
}

/** Suma de los ingredientes (kcal enteras, macros con un decimal). */
export function sumIngredients(ings: readonly RecipeIngredient[]): Pick<Recipe, 'kcal' | 'proteina' | 'carbohidratos' | 'grasa'> {
  const t = ings.reduce((a, i) => ({ kcal: a.kcal + i.kcal, proteina: a.proteina + i.proteina, carbohidratos: a.carbohidratos + i.carbohidratos, grasa: a.grasa + i.grasa }), { kcal: 0, proteina: 0, carbohidratos: 0, grasa: 0 })
  const r = (n: number) => Math.round(n * 10) / 10
  return { kcal: Math.round(t.kcal), proteina: r(t.proteina), carbohidratos: r(t.carbohidratos), grasa: r(t.grasa) }
}

const within = (value: number, target: number, rel: number, abs: number) => Math.abs(value - target) <= Math.max(abs, rel * target)

/**
 * Reglas de la receta (vacío = válida): los ingredientes deben sumar los macros prometidos por
 * la opción (±10 %; tolerancia mínima de 20 kcal / 3 g) y cada ingrediente ser coherente (4/4/9).
 */
export function recipeErrors(r: Recipe, promised: Pick<Suggestion, 'kcal' | 'proteina' | 'carbohidratos' | 'grasa'>): string[] {
  const errors: string[] = []
  const sum = sumIngredients(r.ingredientes)
  const checks = [
    ['kcal', sum.kcal, promised.kcal, 20],
    ['proteína', sum.proteina, promised.proteina, 3],
    ['carbohidratos', sum.carbohidratos, promised.carbohidratos, 3],
    ['grasa', sum.grasa, promised.grasa, 3],
  ] as const
  for (const [name, got, want, abs] of checks) {
    if (!within(got, want, 0.1, abs)) errors.push(`Los ingredientes suman ${got} de ${name} y la opción prometía ${want} (±10 %): ajusta cantidades.`)
  }
  for (const [i, ing] of r.ingredientes.entries()) {
    if (!macrosCoherent(ing, 0.15)) errors.push(`ingredientes[${i}] (${ing.nombre}): kcal no cuadran con sus macros (4/4/9).`)
    if (ing.proteina + ing.carbohidratos + ing.grasa > ing.gramos * 1.05) errors.push(`ingredientes[${i}] (${ing.nombre}): los macros pesan más que los gramos.`)
  }
  return errors
}

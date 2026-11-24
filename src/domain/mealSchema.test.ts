import { describe, expect, it } from 'vitest'
import {
  MealSuggestRequestSchema,
  RecipeToolSchema,
  SuggestionsToolSchema,
  elaborateMaxMin,
  macrosCoherent,
  recipeErrors,
  suggestionErrors,
  sumIngredients,
  type Recipe,
  type Suggestion,
} from './mealSchema'

const option = (over: Partial<Suggestion> = {}): Suggestion => ({
  id: 'o1',
  nombre: 'Tortilla francesa con pavo',
  tipo: 'sencilla',
  descripcion: 'Rápida y con mucha proteína.',
  tiempoMin: 10,
  dificultad: 'facil',
  raciones: 1,
  gramosRacion: 250,
  kcal: 400,
  proteina: 40,
  carbohidratos: 20,
  grasa: 18,
  ingredientesClave: ['huevos', 'pavo', 'pan'],
  porQueEncaja: 'Te faltan 45 g de proteína.',
  ...over,
})
const six = () => [
  option({ id: 'a', nombre: 'Plato A' }),
  option({ id: 'b', nombre: 'Plato B' }),
  option({ id: 'c', nombre: 'Plato C' }),
  option({ id: 'd', nombre: 'Plato D', tipo: 'elaborada', tiempoMin: 40 }),
  option({ id: 'e', nombre: 'Plato E', tipo: 'elaborada', tiempoMin: 30 }),
  option({ id: 'f', nombre: 'Plato F', tipo: 'elaborada', tiempoMin: 25 }),
]

describe('opciones', () => {
  it('exactamente 3 por tanda en el esquema', () => {
    expect(SuggestionsToolSchema.safeParse({ opciones: six().slice(0, 3) }).success).toBe(true)
    expect(SuggestionsToolSchema.safeParse({ opciones: six().slice(0, 2) }).success).toBe(false)
    expect(SuggestionsToolSchema.safeParse({ opciones: six() }).success).toBe(false)
  })

  it('tanda de un tipo: 3 de ese tipo', () => {
    expect(suggestionErrors(six().slice(0, 3), { tiempoMaxMin: 45, kind: 'sencilla' })).toEqual([])
    expect(suggestionErrors(six().slice(3), { tiempoMaxMin: 45, kind: 'elaborada' })).toEqual([])
    expect(suggestionErrors(six().slice(3), { tiempoMaxMin: 45, kind: 'sencilla' })[0]).toContain('exactamente 3 opciones de tipo "sencilla"')
  })

  it('6 válidas sin errores', () => {
    expect(suggestionErrors(six(), { tiempoMaxMin: 45 })).toEqual([])
  })

  it('3 + 3 obligatorio', () => {
    const o = six()
    o[3] = { ...o[3]!, tipo: 'sencilla', tiempoMin: 10 }
    expect(suggestionErrors(o, { tiempoMaxMin: 45 })[0]).toContain('exactamente 3 sencillas y 3 elaboradas')
  })

  it('macros incoherentes (> 10 %)', () => {
    const o = six()
    o[0] = { ...o[0]!, kcal: 600 }
    expect(suggestionErrors(o, { tiempoMaxMin: 45 }).join()).toContain('no cuadra con los macros')
  })

  it('límites de tiempo e ingredientes; las elaboradas respetan el tiempo máximo del usuario', () => {
    const o = six()
    o[0] = { ...o[0]!, tiempoMin: 20, ingredientesClave: ['1', '2', '3', '4', '5', '6', '7'] }
    const errs = suggestionErrors(o, { tiempoMaxMin: 30 })
    expect(errs.join()).toContain('no puede pasar de 15 min')
    expect(errs.join()).toContain('como mucho 6 ingredientes')
    expect(errs.join()).toContain('elaborada no puede pasar de 30 min') // D: 40 min > 30
    expect(elaborateMaxMin(120)).toBe(45)
    expect(elaborateMaxMin(10)).toBe(15)
  })

  it('nombres repetidos o ya vistos (sin tildes ni mayúsculas)', () => {
    const o = six()
    o[1] = { ...o[1]!, nombre: 'plato a' }
    o[5] = { ...o[5]!, nombre: 'Salmón al horno' }
    const errs = suggestionErrors(o, { tiempoMaxMin: 45, excluir: ['SALMON AL HORNO'] })
    expect(errs.join()).toContain('nombre repetido')
    expect(errs.join()).toContain('ya se la propusiste')
  })

  it('macrosCoherent con tolerancia mínima de 15 kcal', () => {
    expect(macrosCoherent({ kcal: 400, proteina: 40, carbohidratos: 20, grasa: 18 }, 0.1)).toBe(true)
    expect(macrosCoherent({ kcal: 30, proteina: 1, carbohidratos: 1, grasa: 0 }, 0.1)).toBe(false)
    expect(macrosCoherent({ kcal: 20, proteina: 1, carbohidratos: 1, grasa: 0 }, 0.1)).toBe(true)
  })

  it('petición: contexto con lo que queda negativo y exclusiones', () => {
    const prefs = { noLeGusta: 'coliflor', dieta: 'omnivora', presupuesto: 'bajo', utensilios: ['sarten'], tiempoMaxMin: 30 }
    const ctx = { comida: 'dinner', objetivo: 'deficit', quedaHoy: { kcal: -150, proteina: 5, carbohidratos: -20, grasa: -3 }, objetivoComida: { kcal: 0, proteina: 5, carbohidratos: 0, grasa: 0 }, ligera: true, preferencias: prefs, ultimasComidas: ['Macarrones'] }
    expect(MealSuggestRequestSchema.safeParse({ context: ctx, excluir: ['Plato A'] }).success).toBe(true)
    expect(MealSuggestRequestSchema.safeParse({ context: { ...ctx, preferencias: { ...prefs, utensilios: [] } } }).success).toBe(false)
    expect(MealSuggestRequestSchema.safeParse({ context: { ...ctx, comida: 'merienda' } }).success).toBe(false)
  })
})

describe('receta', () => {
  const recipe = (over: Partial<Recipe> = {}): Recipe => ({
    nombre: 'Tortilla francesa con pavo',
    raciones: 1,
    tiempoTotal: 10,
    ingredientes: [
      { nombre: 'Huevos', gramos: 120, medidaCasera: '2 huevos', kcal: 172, proteina: 15, carbohidratos: 1, grasa: 12 },
      { nombre: 'Pechuga de pavo', gramos: 100, kcal: 105, proteina: 22, carbohidratos: 1, grasa: 1.5 },
      { nombre: 'Pan integral', gramos: 40, kcal: 100, proteina: 4, carbohidratos: 17, grasa: 1.5 },
      { nombre: 'Aceite de oliva', gramos: 3, medidaCasera: '1 cucharadita', kcal: 27, proteina: 0, carbohidratos: 0, grasa: 3 },
    ],
    pasos: [{ texto: 'Bate los huevos.', minutos: 2 }, { texto: 'Cuaja la tortilla con el pavo.' }],
    kcal: 404,
    proteina: 41,
    carbohidratos: 19,
    grasa: 18,
    ...over,
  })

  it('válida: suma lo prometido (±10 %)', () => {
    expect(RecipeToolSchema.safeParse(recipe()).success).toBe(true)
    expect(sumIngredients(recipe().ingredientes)).toEqual({ kcal: 404, proteina: 41, carbohidratos: 19, grasa: 18 })
    expect(recipeErrors(recipe(), option())).toEqual([])
  })

  it('los ingredientes no suman lo prometido → errores', () => {
    const errs = recipeErrors(recipe(), option({ kcal: 600, proteina: 60, grasa: 30, carbohidratos: 37 }))
    expect(errs.join()).toContain('suman 404 de kcal')
    expect(errs.join()).toContain('de proteína')
  })

  it('ingrediente incoherente', () => {
    const r = recipe()
    r.ingredientes[0] = { ...r.ingredientes[0]!, kcal: 400 }
    expect(recipeErrors(r, { ...option(), kcal: 632 }).join()).toContain('Huevos')
  })

  it('una sola ración', () => {
    expect(RecipeToolSchema.safeParse({ ...recipe(), raciones: 2 }).success).toBe(false)
  })
})

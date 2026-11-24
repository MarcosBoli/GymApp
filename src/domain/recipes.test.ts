import { describe, expect, it } from 'vitest'
import type { Recipe, Suggestion } from './mealSchema'
import { draftItemNutrition, draftTotals } from './foodDraft'
import { draftFromRecipe, draftFromSuggestion, recipeKey, seenNames, splitByKind, webSearchUrl } from './recipes'

const option: Suggestion = {
  id: 's1',
  nombre: 'Tortilla de patatas',
  tipo: 'sencilla',
  descripcion: 'Clásica.',
  tiempoMin: 15,
  dificultad: 'media',
  raciones: 1,
  gramosRacion: 250,
  kcal: 450,
  proteina: 18,
  carbohidratos: 35,
  grasa: 26,
  ingredientesClave: ['huevos', 'patata', 'cebolla'],
  porQueEncaja: 'Encaja.',
}
const recipe: Recipe = {
  nombre: 'Tortilla de patatas',
  raciones: 1,
  tiempoTotal: 15,
  ingredientes: [
    { nombre: 'Patata', gramos: 200, kcal: 154, proteina: 4, carbohidratos: 34, grasa: 0.2 },
    { nombre: 'Huevos', gramos: 120, medidaCasera: '2 huevos L', kcal: 172, proteina: 15, carbohidratos: 1, grasa: 12 },
    { nombre: 'Aceite de oliva', gramos: 13, medidaCasera: '1 cucharada', kcal: 117, proteina: 0, carbohidratos: 0, grasa: 13 },
  ],
  pasos: [{ texto: 'Pocha la patata.' }],
  kcal: 443,
  proteina: 19,
  carbohidratos: 35,
  grasa: 25.2,
}

describe('búsqueda web', () => {
  it('URL de Google construida por la app, con el nombre codificado', () => {
    expect(webSearchUrl(' Tortilla de patatas ')).toBe('https://www.google.com/search?q=receta+Tortilla%20de%20patatas')
    expect(webSearchUrl('Pollo & arroz / curry')).toBe('https://www.google.com/search?q=receta+Pollo%20%26%20arroz%20%2F%20curry')
  })
})

describe('borradores para "Me la he comido"', () => {
  it('desde la receta: un alimento por ingrediente, en gramos, con medida casera en el supuesto', () => {
    const d = draftFromRecipe(recipe)
    expect(d.map((i) => [i.name, i.grams])).toEqual([['Patata', 200], ['Huevos', 120], ['Aceite de oliva', 13]])
    expect(draftItemNutrition(d[1]!).kcal).toBeCloseTo(172)
    expect(draftTotals(d).kcal).toBeCloseTo(443)
    expect(d[2]!.assumption).toBe('≈ 1 cucharada · receta: Tortilla de patatas')
    expect(d[0]!.assumption).toBe('receta: Tortilla de patatas')
  })

  it('sin receta: la estimación como un plato con su ración', () => {
    const [i] = draftFromSuggestion(option)
    expect(i).toMatchObject({ name: 'Tortilla de patatas', grams: 250, confidence: 'baja' })
    expect(draftItemNutrition(i!)).toMatchObject({ kcal: expect.closeTo(450), proteinG: expect.closeTo(18) })
  })
})

describe('opciones', () => {
  it('nombres ya vistos sin repetir', () => {
    expect(seenNames([[option, { ...option, nombre: 'Ensalada' }], [option]])).toEqual(['Tortilla de patatas', 'Ensalada'])
  })

  it('separa rápidas y elaboradas', () => {
    const r = splitByKind([option, { ...option, tipo: 'elaborada' }])
    expect([r.simple.length, r.elaborate.length]).toEqual([1, 1])
  })

  it('clave de caché sin tildes ni mayúsculas', () => {
    expect(recipeKey('Salmón al HORNO')).toBe(recipeKey('salmon al horno'))
  })
})

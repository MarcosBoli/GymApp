import { describe, expect, it } from 'vitest'
import type { UserProfile } from './types'
import { MealSuggestContextSchema } from './mealSchema'
import { buildMealSuggestContext, isLight, mealForHour, mealPrefsFromProfile, mealTarget, recentMealNames, remainingToday, suggestGoal } from './mealSuggestContext'

const target = { kcal: 2200, proteinG: 160, carbsG: 230, fatG: 61 }
const prefs = { noLeGusta: 'coliflor', dieta: 'omnivora', presupuesto: 'medio', utensilios: ['sarten'], tiempoMaxMin: 30 } as const

describe('qué comida es', () => {
  it.each([
    [7, 'breakfast'],
    [10, 'breakfast'],
    [11, 'lunch'],
    [15, 'lunch'],
    [17, 'snack'],
    [20, 'dinner'],
    [23, 'dinner'],
    [2, 'dinner'],
  ] as const)('%d h → %s', (h, meal) => {
    expect(mealForHour(h)).toBe(meal)
  })

  it('objetivo del perfil', () => {
    expect([suggestGoal('lose'), suggestGoal('maintain'), suggestGoal('gain')]).toEqual(['deficit', 'mantenimiento', 'superavit'])
  })
})

describe('lo que queda', () => {
  it('objetivo − registrado, redondeado; puede ser negativo', () => {
    expect(remainingToday(target, { kcal: 1500.4, proteinG: 100.6, carbsG: 250, fatG: 40 })).toEqual({ kcal: 700, proteina: 59, carbohidratos: -20, grasa: 21 })
  })

  it('reparto: la cena se lleva todo; la comida su parte de lo que falta del día', () => {
    const left = { kcal: 1500, proteina: 100, carbohidratos: 150, grasa: 50 }
    expect(mealTarget(left, 'dinner')).toEqual(left)
    expect(mealTarget(left, 'lunch')).toEqual({ kcal: 700, proteina: 47, carbohidratos: 70, grasa: 23 }) // 35 / (35+10+30)
    expect(mealTarget(left, 'snack')).toEqual({ kcal: 375, proteina: 25, carbohidratos: 38, grasa: 13 }) // 10 / 40
    expect(mealTarget({ ...left, carbohidratos: -30 }, 'dinner').carbohidratos).toBe(0) // nunca negativa
  })

  it('ligera por debajo de 250 kcal (o negativo)', () => {
    expect(isLight({ kcal: 249, proteina: 0, carbohidratos: 0, grasa: 0 })).toBe(true)
    expect(isLight({ kcal: -100, proteina: 0, carbohidratos: 0, grasa: 0 })).toBe(true)
    expect(isLight({ kcal: 250, proteina: 0, carbohidratos: 0, grasa: 0 })).toBe(false)
  })
})

describe('preferencias y recientes', () => {
  const profile = { id: 'me', diet: 'vegetariana', budget: 'bajo', utensils: ['horno'], maxCookMinutes: 20, foodDislikes: ' setas ' } as UserProfile
  it('completas → MealPrefs; incompletas → null', () => {
    expect(mealPrefsFromProfile(profile)).toEqual({ noLeGusta: 'setas', dieta: 'vegetariana', presupuesto: 'bajo', utensilios: ['horno'], tiempoMaxMin: 20 })
    expect(mealPrefsFromProfile({ ...profile, utensils: [] })).toBeNull()
    expect(mealPrefsFromProfile({ ...profile, diet: undefined })).toBeNull()
    expect(mealPrefsFromProfile(undefined)).toBeNull()
  })

  it('nombres de los últimos días, sin repetir, lo más reciente primero', () => {
    const items = [
      { foodName: 'Lentejas', date: '2026-11-20', createdAt: 1 },
      { foodName: 'Macarrones', date: '2026-11-22', createdAt: 5 },
      { foodName: 'Manzana', date: '2026-11-23', createdAt: 9 },
      { foodName: 'macarrones', date: '2026-11-23', createdAt: 2 },
      { foodName: 'Paella', date: '2026-11-15', createdAt: 3 }, // fuera de los 3 días
    ]
    expect(recentMealNames(items, '2026-11-20')).toEqual(['Manzana', 'macarrones', 'Lentejas'])
  })
})

describe('buildMealSuggestContext', () => {
  it('contexto completo y válido para el servidor', () => {
    const ctx = buildMealSuggestContext({ meal: 'dinner', goal: 'lose', target, consumed: { kcal: 1700, proteinG: 105, carbsG: 200, fatG: 45 }, prefs: { ...prefs, utensilios: [...prefs.utensilios] }, recentNames: ['Lentejas'], request: '  algo con pollo  ' })
    expect(ctx).toEqual({
      comida: 'dinner',
      objetivo: 'deficit',
      quedaHoy: { kcal: 500, proteina: 55, carbohidratos: 30, grasa: 16 },
      objetivoComida: { kcal: 500, proteina: 55, carbohidratos: 30, grasa: 16 },
      ligera: false,
      preferencias: prefs,
      ultimasComidas: ['Lentejas'],
      peticion: 'algo con pollo',
    })
    expect(MealSuggestContextSchema.safeParse(ctx).success).toBe(true)
  })

  it('ya se pasó del día → ligera, sin petición vacía', () => {
    const ctx = buildMealSuggestContext({ meal: 'snack', goal: 'maintain', target, consumed: { kcal: 2400, proteinG: 170, carbsG: 260, fatG: 70 }, prefs: { ...prefs, utensilios: [...prefs.utensilios] }, recentNames: [], request: '  ' })
    expect(ctx.ligera).toBe(true)
    expect(ctx.quedaHoy.kcal).toBe(-200)
    expect(ctx.objetivoComida.kcal).toBe(0)
    expect(ctx).not.toHaveProperty('peticion')
  })
})

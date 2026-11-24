import { describe, expect, it } from 'vitest'
import { validateProfileForm, type ProfileForm } from './profile'

const training = { trainingGoal: 'hypertrophy', daysPerWeek: 4, sessionMinutes: 60, equipment: ['dumbbell', 'barbell'], limitations: '  rodilla izquierda ' } as const
const meals = { foodDislikes: ' coliflor ', diet: 'vegetariana', budget: 'bajo', utensils: ['horno', 'sarten'], maxCookMinutes: 20 } as const
const valid: ProfileForm = { sex: 'male', birthDate: '1995-06-15', heightCm: '178', weightKg: '80,5', activityLevel: 'moderate', goal: 'gain', ...training, equipment: [...training.equipment], ...meals, utensils: [...meals.utensils] }
const TODAY = '2026-11-22'

describe('validateProfileForm', () => {
  it('acepta un formulario válido y parsea números con coma', () => {
    expect(validateProfileForm(valid, TODAY)).toEqual({
      ok: true,
      value: {
        sex: 'male', birthDate: '1995-06-15', heightCm: 178, weightKg: 80.5, activityLevel: 'moderate', goal: 'gain',
        trainingGoal: 'hypertrophy', daysPerWeek: 4, sessionMinutes: 60, equipment: ['barbell', 'dumbbell'], limitations: 'rodilla izquierda',
        foodDislikes: 'coliflor', diet: 'vegetariana', budget: 'bajo', utensils: ['sarten', 'horno'], maxCookMinutes: 20,
      },
    })
  })

  it.each([
    [{ sex: '' }, 'sex'],
    [{ birthDate: '' }, 'birthDate'],
    [{ birthDate: '15/06/1995' }, 'birthDate'],
    [{ birthDate: '2027-01-01' }, 'birthDate'],
    [{ birthDate: '1900-01-01' }, 'birthDate'],
    [{ heightCm: '' }, 'heightCm'],
    [{ heightCm: '90' }, 'heightCm'],
    [{ heightCm: '260' }, 'heightCm'],
    [{ weightKg: 'abc' }, 'weightKg'],
    [{ weightKg: '20' }, 'weightKg'],
    [{ weightKg: '400' }, 'weightKg'],
    [{ equipment: [] }, 'equipment'],
    [{ daysPerWeek: 0 }, 'daysPerWeek'],
    [{ sessionMinutes: 300 }, 'sessionMinutes'],
    [{ trainingGoal: 'zumba' }, 'trainingGoal'],
    [{ limitations: 'x'.repeat(501) }, 'limitations'],
    [{ diet: 'paleo' }, 'diet'],
    [{ budget: 'alto' }, 'budget'],
    [{ utensils: [] }, 'utensils'],
    [{ maxCookMinutes: 0 }, 'maxCookMinutes'],
    [{ foodDislikes: 'x'.repeat(301) }, 'foodDislikes'],
  ] as const)('rechaza %o', (patch, field) => {
    const r = validateProfileForm({ ...valid, ...patch } as ProfileForm, TODAY)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors)).toEqual([field])
  })

  it('devuelve todos los errores a la vez', () => {
    const r = validateProfileForm({ ...valid, sex: '', heightCm: '', weightKg: '' }, TODAY)
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['heightCm', 'sex', 'weightKg'])
  })
})

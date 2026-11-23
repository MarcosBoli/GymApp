import type { ActivityLevel, DateKey, Goal, Sex } from './types'
import { parseDecimal } from './number'

export const ACTIVITY_LEVELS: { id: ActivityLevel; label: string }[] = [
  { id: 'sedentary', label: 'Sedentario' },
  { id: 'light', label: 'Ligero (1-3 días/sem)' },
  { id: 'moderate', label: 'Moderado (3-5 días/sem)' },
  { id: 'active', label: 'Activo (6-7 días/sem)' },
  { id: 'very_active', label: 'Muy activo (trabajo físico)' },
]

export const GOALS: { id: Goal; label: string }[] = [
  { id: 'lose', label: 'Perder grasa' },
  { id: 'maintain', label: 'Mantener' },
  { id: 'gain', label: 'Ganar músculo' },
]

export interface ProfileForm {
  sex: Sex | ''
  birthDate: string
  heightCm: string
  weightKg: string
  activityLevel: ActivityLevel
  goal: Goal
}

export interface ProfileValues {
  sex: Sex
  birthDate: DateKey
  heightCm: number
  weightKg: number
  activityLevel: ActivityLevel
  goal: Goal
}

export type ProfileErrors = Partial<Record<keyof ProfileForm, string>>

/** Valida el formulario de perfil. `today` en formato 'YYYY-MM-DD'. */
export function validateProfileForm(
  form: ProfileForm,
  today: DateKey,
): { ok: true; value: ProfileValues } | { ok: false; errors: ProfileErrors } {
  const errors: ProfileErrors = {}

  if (form.sex !== 'male' && form.sex !== 'female') errors.sex = 'Elige una opción.'

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(form.birthDate) && !Number.isNaN(Date.parse(form.birthDate))
  if (!validDate) errors.birthDate = 'Introduce tu fecha de nacimiento.'
  else if (form.birthDate > today) errors.birthDate = 'La fecha no puede ser futura.'
  else if (Number(today.slice(0, 4)) - Number(form.birthDate.slice(0, 4)) > 110) errors.birthDate = 'Fecha no válida.'

  const heightCm = parseDecimal(form.heightCm)
  if (heightCm === null || heightCm < 100 || heightCm > 250) errors.heightCm = 'Altura entre 100 y 250 cm.'

  const weightKg = parseDecimal(form.weightKg)
  if (weightKg === null || weightKg < 30 || weightKg > 300) errors.weightKg = 'Peso entre 30 y 300 kg.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      sex: form.sex as Sex,
      birthDate: form.birthDate,
      heightCm: heightCm!,
      weightKg: weightKg!,
      activityLevel: form.activityLevel,
      goal: form.goal,
    },
  }
}

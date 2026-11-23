import type { ActivityLevel, DateKey, Goal, Sex } from './types'
import { PLAN_EQUIPMENT, TRAINING_GOALS, type PlanEquipment, type TrainingGoal } from './planSchema'
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

export const TRAINING_GOAL_LABELS: Record<TrainingGoal, string> = { strength: 'Fuerza', hypertrophy: 'Hipertrofia', recomp: 'Recomposición' }
export const EQUIPMENT_LABELS: Record<PlanEquipment, string> = { barbell: 'Barra', dumbbell: 'Mancuernas', machine: 'Máquinas', cable: 'Poleas', bodyweight: 'Peso corporal' }
export const DAYS_OPTIONS = [2, 3, 4, 5, 6] as const
export const MINUTES_OPTIONS = [30, 45, 60, 75, 90, 120] as const
export const LIMITATIONS_MAX = 500

export interface ProfileForm {
  sex: Sex | ''
  birthDate: string
  heightCm: string
  weightKg: string
  activityLevel: ActivityLevel
  goal: Goal
  trainingGoal: TrainingGoal
  daysPerWeek: number
  sessionMinutes: number
  equipment: PlanEquipment[]
  limitations: string
}

export interface ProfileValues {
  sex: Sex
  birthDate: DateKey
  heightCm: number
  weightKg: number
  activityLevel: ActivityLevel
  goal: Goal
  trainingGoal: TrainingGoal
  daysPerWeek: number
  sessionMinutes: number
  equipment: PlanEquipment[]
  limitations: string
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

  if (!TRAINING_GOALS.includes(form.trainingGoal)) errors.trainingGoal = 'Elige un objetivo.'
  if (!Number.isInteger(form.daysPerWeek) || form.daysPerWeek < 1 || form.daysPerWeek > 7) errors.daysPerWeek = 'Entre 1 y 7 días.'
  if (!Number.isInteger(form.sessionMinutes) || form.sessionMinutes < 15 || form.sessionMinutes > 240) errors.sessionMinutes = 'Entre 15 y 240 minutos.'
  const equipment = PLAN_EQUIPMENT.filter((e) => form.equipment.includes(e))
  if (equipment.length === 0) errors.equipment = 'Elige al menos un tipo de material.'
  if (form.limitations.length > LIMITATIONS_MAX) errors.limitations = `Máximo ${LIMITATIONS_MAX} caracteres.`

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
      trainingGoal: form.trainingGoal,
      daysPerWeek: form.daysPerWeek,
      sessionMinutes: form.sessionMinutes,
      equipment,
      limitations: form.limitations.trim(),
    },
  }
}

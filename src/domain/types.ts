import type { PromotionState } from './ranking'
import type { WorkoutSummary } from './summary'
import type { PlanEquipment, TrainingGoal, WeekRating } from './planSchema'

/**
 * Tipos de las entidades persistidas. Puros (sin Dexie) para que domain/ no dependa de la BD.
 * Unidades siempre métricas: kg, cm, g.
 */

/** Día local en formato 'YYYY-MM-DD' (no depende de la zona horaria al agrupar). */
export type DateKey = string
/** Instante en milisegundos desde epoch. */
export type Timestamp = number

export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type Goal = 'lose' | 'maintain' | 'gain'

/** Perfil único (id fijo 'me'). El peso actual sale de bodyweightLogs; la edad de birthDate. */
export interface UserProfile {
  id: 'me'
  sex: Sex
  birthDate: DateKey
  heightCm: number
  activityLevel: ActivityLevel
  goal: Goal
  /** Preferencias de entrenamiento para la rutina con IA (opcionales: perfiles antiguos). */
  trainingGoal?: TrainingGoal
  daysPerWeek?: number
  sessionMinutes?: number
  equipment?: PlanEquipment[]
  limitations?: string
  updatedAt: Timestamp
}

/** Un registro por día (la fecha es la clave primaria). */
export interface BodyweightLog {
  date: DateKey
  weightKg: number
}

export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'legs'

export interface Muscle {
  id: string
  name: string
  group: MuscleGroup
  order: number
}

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other'

export interface Exercise {
  id: string
  name: string
  equipment: Equipment
  isCustom: boolean
}

/** 1 = músculo principal, 0.5 = secundario. */
export type MuscleFactor = 1 | 0.5

export interface ExerciseMuscle {
  exerciseId: string
  muscleId: string
  factor: MuscleFactor
}

export interface Routine {
  id: string
  name: string
  notes?: string
  createdAt: Timestamp
}

export interface RoutineExercise {
  id: string
  routineId: string
  exerciseId: string
  order: number
  targetSets?: number
  targetRepsMin?: number
  targetRepsMax?: number
}

export interface Workout {
  id: string
  /** Vacío en entrenos libres. */
  routineId?: string
  startedAt: Timestamp
  /** Vacío mientras el entreno está en curso. */
  endedAt?: Timestamp
  /** Ejercicios del entreno en orden (incluye los que aún no tienen series). */
  exerciseIds: string[]
  /** Resumen de partida calculado al terminar (estable aunque se recargue). */
  summary?: WorkoutSummary
  /** Día del plan semanal del que sale el entreno (adherencia y "día que toca"). */
  planId?: string
  planDayIndex?: number
  notes?: string
}

export interface WorkoutSet {
  id: string
  workoutId: string
  exerciseId: string
  /** Posición dentro del entreno. */
  order: number
  performedAt: Timestamp
  reps: number
  /** En ejercicios de peso corporal es el lastre añadido (0 sin lastre). */
  weightKg: number
  rpe?: number
  isWarmup: boolean
}

/** Valores nutricionales por 100 g. */
export interface Food {
  id: string
  name: string
  brand?: string
  barcode?: string
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  /** Ración por defecto sugerida al añadirlo. */
  servingG?: number
  isFavorite?: boolean
  source?: 'openfoodfacts' | 'manual'
  createdAt?: Timestamp
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface Meal {
  id: string
  date: DateKey
  type: MealType
  createdAt: Timestamp
}

/** Guarda una copia de los valores por 100 g del alimento: editar/borrar el alimento no altera el histórico. */
export interface MealItem {
  id: string
  mealId: string
  /** Fecha de la comida (copia indexada: permite leer rangos de días en una sola consulta). */
  date?: DateKey
  foodId: string
  grams: number
  /** Para ordenar los alimentos dentro de la comida. */
  createdAt?: Timestamp
  foodName: string
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

export interface PlanExercise {
  exerciseId: string
  sets: number
  repsMin: number
  repsMax: number
  rpeTarget: number
  notes: string
}

export interface PlanDay {
  /** 0 = lunes … 6 = domingo. */
  dayIndex: number
  name: string
  exercises: PlanExercise[]
}

/** Versión de la rutina de una semana. Regenerar o editar crea otra versión (historial). */
export interface WeeklyPlan {
  id: string
  /** Lunes de la semana. */
  weekStart: DateKey
  createdAt: Timestamp
  status: 'active' | 'superseded'
  source: 'ai' | 'manual'
  days: PlanDay[]
  reasoning: string
  model?: string
}

/** Valoración de una semana (para el contexto del plan siguiente). */
export interface WeekFeedback {
  weekStart: DateKey
  rating: WeekRating
  createdAt: Timestamp
}

/** Estado de la serie de promoción de un músculo (o 'global'). */
export interface RankStateRow {
  id: string
  state: PromotionState
}

export interface Setting {
  key: string
  value: unknown
}

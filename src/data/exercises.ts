import type { Equipment, Exercise, ExerciseMuscle } from '../domain/types'
import type { MuscleId } from './muscles'

interface ExerciseSeed {
  id: string
  name: string
  equipment: Equipment
  /** Músculos principales (factor 1). */
  primary: MuscleId[]
  /** Músculos secundarios (factor 0.5). */
  secondary?: MuscleId[]
}

export const EXERCISES: readonly ExerciseSeed[] = [
  // Pecho
  { id: 'bench_press', name: 'Press de banca', equipment: 'barbell', primary: ['chest'], secondary: ['front_delts', 'triceps'] },
  { id: 'incline_bench_press', name: 'Press inclinado con barra', equipment: 'barbell', primary: ['chest'], secondary: ['front_delts', 'triceps'] },
  { id: 'db_bench_press', name: 'Press de banca con mancuernas', equipment: 'dumbbell', primary: ['chest'], secondary: ['front_delts', 'triceps'] },
  { id: 'incline_db_press', name: 'Press inclinado con mancuernas', equipment: 'dumbbell', primary: ['chest'], secondary: ['front_delts', 'triceps'] },
  { id: 'machine_chest_press', name: 'Press de pecho en máquina', equipment: 'machine', primary: ['chest'], secondary: ['front_delts', 'triceps'] },
  { id: 'pec_deck', name: 'Aperturas en máquina (pec deck)', equipment: 'machine', primary: ['chest'], secondary: ['front_delts'] },
  { id: 'cable_crossover', name: 'Cruce de poleas', equipment: 'cable', primary: ['chest'], secondary: ['front_delts'] },
  { id: 'dips', name: 'Fondos en paralelas', equipment: 'bodyweight', primary: ['chest', 'triceps'], secondary: ['front_delts'] },
  { id: 'push_up', name: 'Flexiones', equipment: 'bodyweight', primary: ['chest'], secondary: ['front_delts', 'triceps'] },
  // Espalda
  { id: 'pull_up', name: 'Dominadas', equipment: 'bodyweight', primary: ['lats'], secondary: ['biceps', 'forearms'] },
  { id: 'chin_up', name: 'Dominadas supinas', equipment: 'bodyweight', primary: ['lats', 'biceps'], secondary: ['forearms'] },
  { id: 'lat_pulldown', name: 'Jalón al pecho', equipment: 'cable', primary: ['lats'], secondary: ['biceps'] },
  { id: 'barbell_row', name: 'Remo con barra', equipment: 'barbell', primary: ['lats'], secondary: ['traps', 'rear_delts', 'biceps'] },
  { id: 'db_row', name: 'Remo con mancuerna', equipment: 'dumbbell', primary: ['lats'], secondary: ['rear_delts', 'biceps'] },
  { id: 'seated_cable_row', name: 'Remo en polea baja', equipment: 'cable', primary: ['lats'], secondary: ['traps', 'biceps'] },
  { id: 'deadlift', name: 'Peso muerto', equipment: 'barbell', primary: ['lower_back', 'glutes', 'hamstrings'], secondary: ['traps', 'quads', 'forearms'] },
  { id: 'romanian_deadlift', name: 'Peso muerto rumano', equipment: 'barbell', primary: ['hamstrings'], secondary: ['glutes', 'lower_back'] },
  { id: 'back_extension', name: 'Hiperextensiones', equipment: 'bodyweight', primary: ['lower_back'], secondary: ['glutes', 'hamstrings'] },
  { id: 'barbell_shrug', name: 'Encogimientos con barra', equipment: 'barbell', primary: ['traps'], secondary: ['forearms'] },
  // Hombro
  { id: 'overhead_press', name: 'Press militar', equipment: 'barbell', primary: ['front_delts'], secondary: ['side_delts', 'triceps'] },
  { id: 'db_shoulder_press', name: 'Press de hombro con mancuernas', equipment: 'dumbbell', primary: ['front_delts'], secondary: ['side_delts', 'triceps'] },
  { id: 'lateral_raise', name: 'Elevaciones laterales', equipment: 'dumbbell', primary: ['side_delts'] },
  { id: 'cable_lateral_raise', name: 'Elevaciones laterales en polea', equipment: 'cable', primary: ['side_delts'] },
  { id: 'front_raise', name: 'Elevaciones frontales', equipment: 'dumbbell', primary: ['front_delts'] },
  { id: 'rear_delt_fly', name: 'Pájaros (aperturas posteriores)', equipment: 'dumbbell', primary: ['rear_delts'], secondary: ['traps'] },
  { id: 'face_pull', name: 'Face pull', equipment: 'cable', primary: ['rear_delts'], secondary: ['traps'] },
  // Brazos
  { id: 'barbell_curl', name: 'Curl con barra', equipment: 'barbell', primary: ['biceps'], secondary: ['forearms'] },
  { id: 'db_curl', name: 'Curl con mancuernas', equipment: 'dumbbell', primary: ['biceps'], secondary: ['forearms'] },
  { id: 'hammer_curl', name: 'Curl martillo', equipment: 'dumbbell', primary: ['biceps', 'forearms'] },
  { id: 'preacher_curl', name: 'Curl predicador', equipment: 'machine', primary: ['biceps'] },
  { id: 'triceps_pushdown', name: 'Extensión de tríceps en polea', equipment: 'cable', primary: ['triceps'] },
  { id: 'skull_crusher', name: 'Press francés', equipment: 'barbell', primary: ['triceps'] },
  { id: 'overhead_triceps_extension', name: 'Extensión de tríceps sobre la cabeza', equipment: 'dumbbell', primary: ['triceps'] },
  { id: 'close_grip_bench_press', name: 'Press de banca agarre cerrado', equipment: 'barbell', primary: ['triceps'], secondary: ['chest', 'front_delts'] },
  { id: 'wrist_curl', name: 'Curl de muñeca', equipment: 'dumbbell', primary: ['forearms'] },
  // Core
  { id: 'cable_crunch', name: 'Crunch en polea', equipment: 'cable', primary: ['abs'] },
  { id: 'hanging_leg_raise', name: 'Elevación de piernas colgado', equipment: 'bodyweight', primary: ['abs'], secondary: ['forearms'] },
  { id: 'crunch', name: 'Crunch abdominal', equipment: 'bodyweight', primary: ['abs'] },
  // Piernas
  { id: 'back_squat', name: 'Sentadilla', equipment: 'barbell', primary: ['quads', 'glutes'], secondary: ['lower_back', 'hamstrings'] },
  { id: 'front_squat', name: 'Sentadilla frontal', equipment: 'barbell', primary: ['quads'], secondary: ['glutes', 'abs'] },
  { id: 'leg_press', name: 'Prensa de piernas', equipment: 'machine', primary: ['quads'], secondary: ['glutes'] },
  { id: 'bulgarian_split_squat', name: 'Sentadilla búlgara', equipment: 'dumbbell', primary: ['quads', 'glutes'], secondary: ['hamstrings'] },
  { id: 'lunge', name: 'Zancadas', equipment: 'dumbbell', primary: ['quads'], secondary: ['glutes'] },
  { id: 'leg_extension', name: 'Extensión de cuádriceps', equipment: 'machine', primary: ['quads'] },
  { id: 'leg_curl', name: 'Curl femoral', equipment: 'machine', primary: ['hamstrings'] },
  { id: 'hip_thrust', name: 'Hip thrust', equipment: 'barbell', primary: ['glutes'], secondary: ['hamstrings'] },
  { id: 'standing_calf_raise', name: 'Elevación de gemelos de pie', equipment: 'machine', primary: ['calves'] },
  { id: 'seated_calf_raise', name: 'Elevación de gemelos sentado', equipment: 'machine', primary: ['calves'] },
]

/** Filas listas para Dexie a partir del catálogo semilla. */
export function buildExerciseCatalog(seeds: readonly ExerciseSeed[] = EXERCISES): {
  exercises: Exercise[]
  exerciseMuscles: ExerciseMuscle[]
} {
  const exercises = seeds.map(({ id, name, equipment }) => ({ id, name, equipment, isCustom: false }))
  const exerciseMuscles = seeds.flatMap(({ id, primary, secondary = [] }) => [
    ...primary.map((muscleId) => ({ exerciseId: id, muscleId, factor: 1 as const })),
    ...secondary.map((muscleId) => ({ exerciseId: id, muscleId, factor: 0.5 as const })),
  ])
  return { exercises, exerciseMuscles }
}

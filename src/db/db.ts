import Dexie, { type EntityTable, type Table, type Transaction } from 'dexie'
import type {
  BodyweightLog,
  Exercise,
  ExerciseMuscle,
  Food,
  Meal,
  MealItem,
  Muscle,
  RankStateRow,
  Routine,
  RoutineExercise,
  Setting,
  UserProfile,
  Workout,
  WorkoutSet,
} from '../domain/types'
import { MUSCLES } from '../data/muscles'
import { buildExerciseCatalog } from '../data/exercises'

export type GymDB = Dexie & {
  settings: EntityTable<Setting, 'key'>
  userProfile: EntityTable<UserProfile, 'id'>
  bodyweightLogs: EntityTable<BodyweightLog, 'date'>
  muscles: EntityTable<Muscle, 'id'>
  exercises: EntityTable<Exercise, 'id'>
  exerciseMuscles: Table<ExerciseMuscle, [string, string]>
  routines: EntityTable<Routine, 'id'>
  routineExercises: EntityTable<RoutineExercise, 'id'>
  workouts: EntityTable<Workout, 'id'>
  sets: EntityTable<WorkoutSet, 'id'>
  foods: EntityTable<Food, 'id'>
  meals: EntityTable<Meal, 'id'>
  mealItems: EntityTable<MealItem, 'id'>
  rankStates: EntityTable<RankStateRow, 'id'>
}

export const DB_NAME = 'gymapp'

/** Inserta músculos y ejercicios del catálogo semilla. */
export async function seedCatalog(tx: Transaction): Promise<void> {
  const { exercises, exerciseMuscles } = buildExerciseCatalog()
  await tx.table('muscles').bulkPut([...MUSCLES])
  await tx.table('exercises').bulkPut(exercises)
  await tx.table('exerciseMuscles').bulkPut(exerciseMuscles)
}

/**
 * Esquema versionado. Reglas:
 * - Nunca editar una versión ya publicada: añadir db.version(n + 1) con su .upgrade().
 * - Solo se declaran las propiedades indexadas; el resto de campos se guardan igual.
 * - IDs de texto: slugs fijos en el catálogo semilla, UUID (newId) en datos del usuario.
 */
export function createDb(name = DB_NAME): GymDB {
  const db = new Dexie(name) as GymDB

  db.version(1).stores({
    settings: 'key',
  })

  db.version(2)
    .stores({
      userProfile: 'id',
      bodyweightLogs: 'date',
      muscles: 'id, group',
      exercises: 'id, name',
      exerciseMuscles: '[exerciseId+muscleId], exerciseId, muscleId',
      routines: 'id, createdAt',
      routineExercises: 'id, routineId, exerciseId, [routineId+order]',
      workouts: 'id, startedAt, routineId',
      sets: 'id, workoutId, exerciseId, [workoutId+order], [exerciseId+performedAt]',
      foods: 'id, name, &barcode',
      meals: 'id, date, [date+type]',
      mealItems: 'id, mealId, foodId',
    })
    // Instalaciones que ya tenían la v1: reciben el catálogo al actualizar
    .upgrade(seedCatalog)

  // v3: estado de las series de promoción por músculo (y 'global')
  db.version(3).stores({
    rankStates: 'id',
  })

  // BD nueva (primer arranque): Dexie dispara populate una única vez
  db.on('populate', seedCatalog)

  return db
}

export const db = createDb()

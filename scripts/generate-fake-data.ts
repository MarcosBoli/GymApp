/**
 * Genera N días (por defecto 365) de entrenos, comidas y pesajes falsos usando las
 * funciones reales de la app sobre una IndexedDB en memoria, y los exporta como un
 * backup JSON importable desde Perfil → Importar.
 *
 *   npm run fake-data                    → fake-data/gymapp-fake-365d.json
 *   npm run fake-data -- --days 730      → 2 años
 *
 * Determinista (PRNG con semilla) para poder comparar mediciones de rendimiento.
 */
import 'fake-indexeddb/auto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createDb } from '../src/db/db'
import { addExerciseToWorkout, addSet, finishWorkout, startWorkout } from '../src/db/workouts'
import { addFoodToMeal, logBodyweight, saveFood } from '../src/db/food'
import { saveProfile } from '../src/db/profile'
import { exportAll } from '../src/db/backup'
import { toDateKey } from '../src/domain/dates'
import type { Food, MealType } from '../src/domain/types'

const days = Number(process.argv[process.argv.indexOf('--days') + 1]) || 365
const out = `fake-data/gymapp-fake-${days}d.json`

// PRNG determinista (mulberry32)
let seed = 42
const rand = () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)]!
const round = (n: number, step: number) => Math.round(n / step) * step

const DAY = 86_400_000
const today = new Date()
today.setHours(12, 0, 0, 0)
const start = new Date(today.getTime() - (days - 1) * DAY)

// [ejercicio, peso inicial (kg), reps]
const SESSIONS: Record<number, [string, number, number][]> = {
  1: [['bench_press', 70, 6], ['incline_db_press', 22, 10], ['overhead_press', 40, 8], ['lateral_raise', 8, 15], ['triceps_pushdown', 25, 12]],
  2: [['pull_up', 0, 8], ['barbell_row', 60, 8], ['lat_pulldown', 55, 10], ['face_pull', 15, 15], ['barbell_curl', 25, 10]],
  4: [['back_squat', 90, 5], ['romanian_deadlift', 80, 8], ['leg_press', 140, 10], ['leg_curl', 35, 12], ['standing_calf_raise', 60, 12]],
  6: [['deadlift', 120, 5], ['db_bench_press', 26, 10], ['seated_cable_row', 55, 10], ['hammer_curl', 14, 10], ['cable_crunch', 30, 12]],
}

const FOODS: Omit<Food, 'id'>[] = [
  { name: 'Avena', kcal: 372, proteinG: 13, carbsG: 59, fatG: 7, servingG: 60 },
  { name: 'Leche semidesnatada', kcal: 46, proteinG: 3.2, carbsG: 4.7, fatG: 1.6, servingG: 250 },
  { name: 'Plátano', kcal: 89, proteinG: 1.1, carbsG: 23, fatG: 0.3, servingG: 120 },
  { name: 'Huevos', kcal: 143, proteinG: 13, carbsG: 0.7, fatG: 9.5, servingG: 120 },
  { name: 'Pan integral', kcal: 247, proteinG: 13, carbsG: 41, fatG: 3.4, servingG: 60 },
  { name: 'Pechuga de pollo', kcal: 120, proteinG: 23, carbsG: 0, fatG: 2.6, servingG: 200 },
  { name: 'Arroz blanco', kcal: 360, proteinG: 7, carbsG: 79, fatG: 0.6, servingG: 90 },
  { name: 'Pasta', kcal: 371, proteinG: 13, carbsG: 75, fatG: 1.5, servingG: 100 },
  { name: 'Ternera picada', kcal: 250, proteinG: 26, carbsG: 0, fatG: 17, servingG: 150 },
  { name: 'Salmón', kcal: 208, proteinG: 20, carbsG: 0, fatG: 13, servingG: 150 },
  { name: 'Aceite de oliva', kcal: 884, proteinG: 0, carbsG: 0, fatG: 100, servingG: 10 },
  { name: 'Brócoli', kcal: 34, proteinG: 2.8, carbsG: 7, fatG: 0.4, servingG: 150 },
  { name: 'Patata', kcal: 77, proteinG: 2, carbsG: 17, fatG: 0.1, servingG: 250 },
  { name: 'Yogur griego', brand: 'Hacendado', kcal: 120, proteinG: 6, carbsG: 4, fatG: 9, servingG: 125 },
  { name: 'Whey', brand: 'MyProtein', kcal: 400, proteinG: 80, carbsG: 6, fatG: 6, servingG: 30 },
  { name: 'Nueces', kcal: 654, proteinG: 15, carbsG: 14, fatG: 65, servingG: 30 },
  { name: 'Manzana', kcal: 52, proteinG: 0.3, carbsG: 14, fatG: 0.2, servingG: 180 },
  { name: 'Atún en lata', kcal: 116, proteinG: 26, carbsG: 0, fatG: 1, servingG: 80 },
  { name: 'Lentejas cocidas', kcal: 116, proteinG: 9, carbsG: 20, fatG: 0.4, servingG: 250 },
  { name: 'Queso fresco', kcal: 174, proteinG: 12, carbsG: 3, fatG: 13, servingG: 60 },
  { name: 'Nutella', brand: 'Ferrero', barcode: '3017620422003', kcal: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9, servingG: 15 },
]
const MEALS: Record<MealType, number[]> = {
  breakfast: [0, 1, 2, 3, 4, 13],
  lunch: [5, 6, 7, 8, 9, 10, 11, 12, 18],
  dinner: [3, 5, 9, 10, 11, 12, 17, 19],
  snack: [13, 14, 15, 16, 20, 2],
}

async function main() {
  const t0 = performance.now()
  const db = createDb('fake-data')
  await saveProfile({ sex: 'male', birthDate: '1995-05-10', heightCm: 180, weightKg: 78, activityLevel: 'moderate', goal: 'gain', trainingGoal: 'hypertrophy', daysPerWeek: 4, sessionMinutes: 75, equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'], limitations: '', foodDislikes: '', diet: 'omnivora', budget: 'medio', utensils: ['sarten', 'microondas'], maxCookMinutes: 30 }, start.getTime(), db)
  const foods: Food[] = []
  for (const f of FOODS) foods.push(await saveFood(f, start.getTime(), {}, db))

  const vacation = new Set([Math.floor(days * 0.3 / 7), Math.floor(days * 0.75 / 7)])
  let sessionsDone = 0
  let sets = 0
  let mealItems = 0
  const finishTimes: number[] = []

  for (let d = 0; d < days; d++) {
    const date = new Date(start.getTime() + d * DAY)
    const key = toDateKey(date)
    const progress = d / days

    // Peso: volumen de +4 kg en el año con ruido diario; 85 % de días con pesaje
    if (rand() < 0.85) await logBodyweight(key, round(78 + 4 * progress + (rand() - 0.5) * 1.2, 0.1), db)

    // Comidas: 90 % de días registrados, 3-4 comidas de 2-4 alimentos
    if (rand() < 0.9) {
      for (const type of ['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]) {
        if (type === 'snack' && rand() < 0.4) continue
        const n = 2 + Math.floor(rand() * 3)
        for (let i = 0; i < n; i++) {
          const food = foods[pick(MEALS[type])]!
          await addFoodToMeal(key, type, food, round((food.servingG ?? 100) * (0.7 + rand() * 0.8), 5), date.getTime() + i, db)
          mealItems++
        }
      }
    }

    // Entreno: lunes, martes, jueves y sábado; 10 % de sesiones saltadas y 2 semanas de vacaciones
    const plan = SESSIONS[date.getDay()]
    if (!plan || vacation.has(Math.floor(d / 7)) || rand() < 0.1) continue
    // A las 18:00, salvo hoy si aún no son las 18 (nada de entrenos con fecha futura)
    let now = Math.min(new Date(date).setHours(18, 0, 0, 0), Date.now() - 2 * 3_600_000)
    const w = await startWorkout(now, undefined, db)
    for (const [exerciseId, base, reps] of plan) {
      await addExerciseToWorkout(w.id, exerciseId, db)
      const weight = round(base * (1 + 0.25 * progress) * (0.97 + rand() * 0.06), 2.5)
      if (exerciseId === plan[0]![0] && base > 0) {
        await addSet(w.id, exerciseId, { weightKg: round(weight * 0.5, 2.5), reps: 10, isWarmup: true }, (now += 90_000), db)
        sets++
      }
      const n = 3 + (rand() < 0.3 ? 1 : 0)
      for (let i = 0; i < n; i++) {
        const r = Math.max(1, reps - i + Math.round((rand() - 0.5) * 2))
        await addSet(w.id, exerciseId, { weightKg: base === 0 ? round(10 * progress, 2.5) : weight, reps: r, isWarmup: false, ...(rand() < 0.5 ? { rpe: pick([7, 7.5, 8, 8.5, 9]) } : {}) }, (now += 150_000), db)
        sets++
      }
    }
    const t = performance.now()
    await finishWorkout(w.id, now + 300_000, db)
    finishTimes.push(performance.now() - t)
    sessionsDone++
  }

  const backup = await exportAll(today, db)
  mkdirSync('fake-data', { recursive: true })
  writeFileSync(out, JSON.stringify(backup))

  const avg = finishTimes.reduce((a, b) => a + b, 0) / finishTimes.length
  const last = finishTimes.slice(-20).reduce((a, b) => a + b, 0) / 20
  console.log(`${days} días → ${sessionsDone} entrenos, ${sets} series, ${mealItems} alimentos en comidas`)
  console.log(`finishWorkout: medio ${avg.toFixed(0)} ms, primeros 20 ${(finishTimes.slice(0, 20).reduce((a, b) => a + b, 0) / 20).toFixed(0)} ms, últimos 20 ${last.toFixed(0)} ms (fake-indexeddb)`)
  console.log(`Escrito ${out} (${(JSON.stringify(backup).length / 1024).toFixed(0)} kB) en ${((performance.now() - t0) / 1000).toFixed(1)} s`)
}

void main()

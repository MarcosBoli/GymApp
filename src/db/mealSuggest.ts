import type { DateKey } from '../domain/types'
import { addDays } from '../domain/dates'
import { energyOverview } from '../domain/energy'
import { mealPrefsFromProfile, recentMealNames } from '../domain/mealSuggestContext'
import { db as defaultDb, type GymDB } from './db'
import { getEnergyInputs } from './food'

/** Días de comidas recientes que se envían para no repetir (hoy incluido). */
export const RECENT_MEAL_DAYS = 3

/** Lo que necesita "¿Qué como?": objetivo y lo comido hoy, preferencias y nombres recientes. */
export async function getMealSuggestInputs(today: DateKey, db: GymDB = defaultDb) {
  const from = addDays(today, -(RECENT_MEAL_DAYS - 1))
  const [inputs, recent] = await Promise.all([getEnergyInputs(today, db), db.mealItems.where('date').between(from, today, true, true).toArray()])
  return {
    overview: energyOverview(inputs),
    goal: inputs.profile?.goal,
    prefs: mealPrefsFromProfile(inputs.profile),
    recentNames: recentMealNames(recent, from),
  }
}

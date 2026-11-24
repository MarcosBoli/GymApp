import type { MealType } from '../../domain/types'
import { MEAL_TYPES } from '../../domain/food'

/** Selector de comida (desayuno / comida / cena / snacks). */
export function MealPicker({ meal, setMeal }: { meal: MealType; setMeal: (m: MealType) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm text-neutral-400">Comida</legend>
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-white/5 p-1">
        {MEAL_TYPES.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={meal === m.id}
            onClick={() => setMeal(m.id)}
            className={`h-9 rounded-lg text-sm font-medium ${meal === m.id ? 'bg-accent text-bg' : 'text-neutral-300'}`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

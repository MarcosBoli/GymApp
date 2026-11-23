import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Food, MealType } from '../../domain/types'
import { nutritionFor, parseGrams, quickGramOptions } from '../../domain/food'
import { formatDecimal } from '../../domain/number'
import { db } from '../../db/db'
import { addFoodToMeal, deleteMealItem, toggleFavorite, updateMealItemGrams } from '../../db/food'
import { useFoodUi } from '../../store/foodUi'
import { MacroLegend } from './MacroLegend'

interface Props {
  mealType: MealType
  mealLabel: string
  date: string
  foodId: string
  itemId?: string
  grams?: number
}

export function QuantityForm(props: Props) {
  const food = useLiveQuery(() => db.foods.get(props.foodId), [props.foodId])
  if (!food) return null
  return <Body {...props} food={food} />
}

function Body({ mealType, mealLabel, date, itemId, grams: initialGrams, food }: Props & { food: Food }) {
  const { open, close } = useFoodUi()
  const [text, setText] = useState(formatDecimal(initialGrams ?? food.servingG ?? 100))
  const grams = parseGrams(text)
  const n = nutritionFor(food, grams ?? 0)

  async function save() {
    if (grams === null) return
    if (itemId) await updateMealItemGrams(itemId, grams)
    else await addFoodToMeal(date, mealType, food, grams, Date.now())
    close()
  }

  async function remove() {
    if (itemId) await deleteMealItem(itemId)
    close()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-semibold">{food.name}</h3>
          <p className="text-sm text-zinc-500">
            {food.brand ?? 'Sin marca'} · {formatDecimal(Math.round(food.kcal))} kcal/100 g
          </p>
        </div>
        <button
          type="button"
          onClick={() => toggleFavorite(food.id)}
          aria-pressed={food.isFavorite === true}
          aria-label={food.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
          className={`text-3xl leading-none ${food.isFavorite ? 'text-amber-300' : 'text-zinc-600'}`}
        >
          ★
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-400">Cantidad (g)</span>
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => e.target.select()}
          className="h-16 w-full rounded-2xl border border-border bg-surface text-center !text-3xl font-bold tabular-nums outline-none focus:border-accent/60"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {quickGramOptions(food.servingG).map((g) => (
          <button key={g} type="button" onClick={() => setText(String(g))} className="h-10 rounded-full bg-white/5 px-4 text-sm font-medium active:bg-white/10">
            {g} g{g === Math.round(food.servingG ?? -1) ? ' (ración)' : ''}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="text-3xl font-bold tabular-nums">
          {formatDecimal(Math.round(n.kcal))} <span className="text-base font-normal text-zinc-400">kcal</span>
        </div>
        <MacroLegend proteinG={n.proteinG} carbsG={n.carbsG} fatG={n.fatG} />
      </div>

      {grams === null && <p className="text-sm text-red-300">Introduce una cantidad entre 1 y 5000 g.</p>}

      <button type="button" disabled={grams === null} onClick={save} className="h-14 w-full rounded-2xl bg-accent text-lg font-bold text-bg active:scale-[0.98] disabled:opacity-40">
        {itemId ? 'Guardar' : `Añadir a ${mealLabel}`}
      </button>
      <div className="flex justify-between text-sm">
        <button type="button" onClick={() => open({ kind: 'form', mealType, foodId: food.id, draft: { ...food, name: food.name } })} className="py-2 text-zinc-400 active:text-zinc-200">
          Editar alimento
        </button>
        {itemId && (
          <button type="button" onClick={remove} className="py-2 text-red-300">
            Quitar de {mealLabel}
          </button>
        )}
      </div>
    </div>
  )
}

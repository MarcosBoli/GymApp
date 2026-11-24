import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Food, MealType } from '../../domain/types'
import { foodSubtitle, searchFoods } from '../../domain/food'
import { formatDecimal } from '../../domain/number'
import { db } from '../../db/db'
import { listFavoriteFoods, listRecentFoods } from '../../db/food'
import { useFoodUi } from '../../store/foodUi'

export function AddFood({ mealType, today }: { mealType: MealType; today: string }) {
  const open = useFoodUi((s) => s.open)
  const [query, setQuery] = useState('')
  const foods = useLiveQuery(() => db.foods.toArray())
  const favorites = useLiveQuery(() => listFavoriteFoods())
  const recents = useLiveQuery(() => listRecentFoods(today), [today])
  const results = useMemo(() => (foods && query.trim() ? searchFoods(foods, query) : []), [foods, query])
  const pick = (food: Food) => open({ kind: 'quantity', mealType, foodId: food.id })

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar en mis alimentos"
        className="h-12 w-full rounded-xl border border-border bg-surface px-4 outline-none focus:border-accent/60"
      />
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => open({ kind: 'scan', mealType })} className="h-12 rounded-xl bg-accent font-semibold text-bg active:scale-[0.98]">
          Escanear
        </button>
        <button type="button" onClick={() => open({ kind: 'estimate', mealType, mode: 'photo' })} className="h-12 rounded-xl bg-accent font-semibold text-bg active:scale-[0.98]">
          Foto
        </button>
        <button type="button" onClick={() => open({ kind: 'estimate', mealType, mode: 'text' })} className="h-12 rounded-xl bg-accent font-semibold text-bg active:scale-[0.98]">
          Describir
        </button>
        <button
          type="button"
          onClick={() => open({ kind: 'form', mealType, draft: { name: query.trim() } })}
          className="col-span-3 h-12 rounded-xl border border-border font-semibold active:bg-white/5"
        >
          Crear alimento
        </button>
      </div>

      {query.trim() ? (
        <FoodList title="Resultados" foods={results} onPick={pick} empty="No está en tus alimentos. Escanéalo o créalo." />
      ) : (
        <>
          <FoodList title="Favoritos" foods={favorites ?? []} onPick={pick} empty="Marca alimentos con ★ para tenerlos aquí." />
          <FoodList title="Recientes" foods={recents ?? []} onPick={pick} empty="Aquí aparecerá lo que comas." />
        </>
      )}
    </div>
  )
}

function FoodList({ title, foods, onPick, empty }: { title: string; foods: Food[]; onPick: (f: Food) => void; empty: string }) {
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold tracking-wide text-neutral-400 uppercase">{title}</h3>
      {foods.length === 0 ? (
        <p className="py-3 text-sm text-neutral-500">{empty}</p>
      ) : (
        <ul>
          {foods.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => onPick(f)} className="flex w-full items-center justify-between gap-3 border-b border-border/60 py-3 text-left active:bg-white/5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {f.isFavorite && <span className="mr-1 text-amber-300">★</span>}
                    {f.name}
                  </span>
                  <span className="block truncate text-sm text-neutral-500">{foodSubtitle(f)}</span>
                </span>
                <span className="shrink-0 text-sm text-neutral-400 tabular-nums">{formatDecimal(Math.round(f.kcal))} kcal/100 g</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

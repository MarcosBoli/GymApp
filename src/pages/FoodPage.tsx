import { useLiveQuery } from 'dexie-react-hooks'
import { itemNutrition, MEAL_TYPES } from '../domain/food'
import { addDays, fromDateKey, toDateKey } from '../domain/dates'
import { energyOverview } from '../domain/energy'
import { formatDecimal } from '../domain/number'
import { getDayMeals, getEnergyInputs } from '../db/food'
import { useFoodUi } from '../store/foodUi'
import { PageHeader } from '../components/layout/PageHeader'
import { FoodSheets } from '../components/food/FoodSheets'
import { MacroLegend } from '../components/food/MacroLegend'

const dayFormat = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

export default function FoodPage() {
  const { date: selected, setDate, open } = useFoodUi()
  const today = toDateKey(new Date())
  const date = selected ?? today
  const day = useLiveQuery(() => getDayMeals(date), [date])
  const overview = useLiveQuery(async () => energyOverview(await getEnergyInputs(date)), [date])

  return (
    <>
      <PageHeader title="Comida" />
      <div className="space-y-4 px-4">
        <nav className="flex items-center justify-between rounded-xl border border-border bg-surface p-1" aria-label="Día">
          <button type="button" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior" className="size-11 rounded-lg text-xl active:bg-white/5">
            ‹
          </button>
          <button type="button" onClick={() => setDate(undefined)} className="font-semibold first-letter:uppercase">
            {date === today ? 'Hoy' : date === addDays(today, -1) ? 'Ayer' : dayFormat.format(fromDateKey(date))}
          </button>
          <button
            type="button"
            onClick={() => setDate(addDays(date, 1) >= today ? undefined : addDays(date, 1))}
            disabled={date >= today}
            aria-label="Día siguiente"
            className="size-11 rounded-lg text-xl active:bg-white/5 disabled:opacity-30"
          >
            ›
          </button>
        </nav>

        {day && (
          <section className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold tabular-nums">
                {formatDecimal(Math.round(day.totals.kcal))}
                {overview?.ready && <span className="text-lg font-normal text-zinc-400"> / {formatDecimal(overview.target.kcal)}</span>}
                <span className="ml-1 text-base font-normal text-zinc-400">kcal</span>
              </span>
            </div>
            <MacroLegend {...day.totals} />
          </section>
        )}

        {day &&
          MEAL_TYPES.map(({ id, label }) => {
            const slot = day.byType[id]
            return (
              <section key={id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{label}</h2>
                  <span className="text-sm text-zinc-400 tabular-nums">{formatDecimal(Math.round(slot.totals.kcal))} kcal</span>
                </div>
                {slot.items.length > 0 && (
                  <ul className="mt-2">
                    {slot.items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => open({ kind: 'quantity', mealType: id, foodId: item.foodId, itemId: item.id, grams: item.grams })}
                          className="flex w-full items-center justify-between gap-3 border-t border-border/60 py-2.5 text-left active:bg-white/5"
                        >
                          <span className="min-w-0">
                            <span className="block truncate">{item.foodName}</span>
                            <span className="text-sm text-zinc-500">{formatDecimal(item.grams)} g</span>
                          </span>
                          <span className="shrink-0 text-sm text-zinc-300 tabular-nums">{formatDecimal(Math.round(itemNutrition(item).kcal))} kcal</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" onClick={() => open({ kind: 'add', mealType: id })} className="mt-2 h-11 w-full rounded-xl border border-dashed border-accent/40 font-semibold text-accent active:bg-accent/10">
                  + Añadir
                </button>
              </section>
            )
          })}
      </div>
      <FoodSheets date={date} />
    </>
  )
}

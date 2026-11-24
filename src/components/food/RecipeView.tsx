import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { MealType } from '../../domain/types'
import type { MealPrefs, RecipeResponse, Suggestion } from '../../domain/mealSchema'
import { DIFFICULTY_LABELS, draftFromRecipe, draftFromSuggestion, webSearchUrl } from '../../domain/recipes'
import { formatDecimal } from '../../domain/number'
import { getCachedRecipe, getRecipe, saveRecipe, setRecipeFavorite } from '../../db/recipes'
import { AiRequestError, callAi } from '../../lib/aiClient'
import { useFoodUi } from '../../store/foodUi'

const n0 = (n: number) => formatDecimal(Math.round(n))

/** Abre el borrador editable de "Me la he comido": con la receta si existe, si no con la estimación. */
export async function openAteIt(option: Suggestion, mealType: MealType) {
  const cached = await getCachedRecipe(option.nombre)
  useFoodUi.getState().open({
    kind: 'estimate',
    mealType,
    mode: 'draft',
    draft: cached
      ? { items: draftFromRecipe(cached.recipe), comment: `Ingredientes de la receta «${cached.recipe.nombre}». Ajusta los gramos a lo que comiste.`, source: 'ia-receta' }
      : { items: draftFromSuggestion(option), comment: `Estimación de «${option.nombre}». Ajusta la ración si tu plato era distinto.`, source: 'ia-receta' },
  })
}

/** Hoja independiente (desde "Mis recetas"): la receta ya está guardada, no gasta IA. */
export default function RecipeSheet({ option, mealType }: { option: Suggestion; mealType: MealType }) {
  return <RecipeView option={option} prefs={null} mealType={mealType} />
}

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; id: string }

/**
 * Receta de una opción: primero la guardada (Dexie), si no se genera con IA y se guarda.
 * Ingredientes con casilla, pasos numerados, favorita, búsqueda web y "Me la he comido".
 */
export function RecipeView({ option, prefs, mealType, onBack }: { option: Suggestion; prefs: MealPrefs | null; mealType: MealType; onBack?: () => void }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set())
  const [attempt, setAttempt] = useState(0)
  const saved = useLiveQuery(async () => (load.kind === 'ready' ? ((await getRecipe(load.id)) ?? null) : null), [load])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoad({ kind: 'loading' })
      try {
        const cached = await getCachedRecipe(option.nombre)
        if (cached) return !cancelled && setLoad({ kind: 'ready', id: cached.id })
        if (!prefs) return !cancelled && setLoad({ kind: 'error', message: 'Esta receta no está guardada. Pídela desde «¿Qué como?».' })
        const { receta } = await callAi<RecipeResponse>('/api/recipe', { opcion: option, preferencias: prefs })
        const row = await saveRecipe(option, receta, Date.now())
        if (!cancelled) setLoad({ kind: 'ready', id: row.id })
      } catch (err) {
        if (!cancelled) setLoad({ kind: 'error', message: err instanceof AiRequestError ? err.message : 'No se pudo preparar la receta. Inténtalo de nuevo.' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [option, prefs, attempt])

  const back = onBack && (
    <button type="button" onClick={onBack} className="h-11 w-full rounded-xl border border-border font-semibold">
      Volver a las opciones
    </button>
  )

  if (load.kind === 'loading' || (load.kind === 'ready' && !saved)) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 py-10" role="status" aria-live="polite">
          <span aria-hidden className="size-10 animate-spin rounded-full border-4 border-accent/30 border-t-accent" />
          <span className="font-semibold">Preparando la receta…</span>
          <span className="text-sm text-neutral-400">{option.nombre}</span>
        </div>
        {back}
      </div>
    )
  }

  if (load.kind === 'error' || !saved) {
    return (
      <div className="space-y-4">
        <p role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-red-200">
          {load.kind === 'error' ? load.message : 'No se encontró la receta.'}
        </p>
        {prefs && (
          <button type="button" onClick={() => setAttempt((a) => a + 1)} className="h-12 w-full rounded-xl bg-accent font-semibold text-bg">
            Reintentar
          </button>
        )}
        <a href={webSearchUrl(option.nombre)} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center rounded-xl border border-border font-semibold">
          Buscar en la web
        </a>
        {back}
      </div>
    )
  }

  const r = saved.recipe
  const toggle = (i: number) => {
    const next = new Set(checked)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setChecked(next)
  }

  return (
    <article className="space-y-5">
      <header className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-xl font-bold">{r.nombre}</h3>
          <button
            type="button"
            aria-pressed={saved.isFavorite}
            aria-label={saved.isFavorite ? 'Quitar de Mis recetas' : 'Guardar en Mis recetas'}
            onClick={() => setRecipeFavorite(saved.id, !saved.isFavorite, Date.now())}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${saved.isFavorite ? 'border-accent bg-accent text-bg' : 'border-border text-neutral-300'}`}
          >
            {saved.isFavorite ? '★ Guardada' : '☆ Guardar'}
          </button>
        </div>
        <p className="text-sm text-neutral-400">
          {r.tiempoTotal} min · {DIFFICULTY_LABELS[saved.option.dificultad]} · 1 ración
        </p>
        <p className="text-sm text-neutral-200 tabular-nums">
          {n0(r.kcal)} kcal · P {n0(r.proteina)} g · C {n0(r.carbohidratos)} g · G {n0(r.grasa)} g
        </p>
      </header>

      <section>
        <h4 className="mb-2 text-sm font-semibold tracking-wide text-neutral-400 uppercase">Ingredientes</h4>
        <ul className="space-y-1">
          {r.ingredientes.map((ing, i) => (
            <li key={i}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-2 active:bg-white/5">
                <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} className="size-5 shrink-0 accent-[#ff4545]" />
                <span className={`min-w-0 flex-1 ${checked.has(i) ? 'text-neutral-500 line-through' : ''}`}>
                  {ing.nombre}
                  {ing.medidaCasera && <span className="text-sm text-neutral-500"> · {ing.medidaCasera}</span>}
                </span>
                <span className="shrink-0 text-sm text-neutral-300 tabular-nums">{n0(ing.gramos)} g</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="mb-2 text-sm font-semibold tracking-wide text-neutral-400 uppercase">Pasos</h4>
        <ol className="space-y-3">
          {r.pasos.map((p, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">{i + 1}</span>
              <p className="pt-0.5">
                {p.texto}
                {p.minutos && <span className="ml-1 text-sm whitespace-nowrap text-neutral-500">({p.minutos} min)</span>}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {r.consejos && r.consejos.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-3">
          <h4 className="mb-1 text-sm font-semibold">Consejos</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-300">
            {r.consejos.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-2">
        <button type="button" onClick={() => openAteIt(saved.option, mealType)} className="h-12 w-full rounded-xl bg-accent font-semibold text-bg active:scale-[0.98]">
          Me la he comido
        </button>
        <a href={webSearchUrl(r.nombre)} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center rounded-xl border border-border font-semibold">
          Buscar en la web
        </a>
        {back}
      </div>
    </article>
  )
}

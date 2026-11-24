import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import type { MealType } from '../../domain/types'
import type { MealSuggestionsResponse, Suggestion } from '../../domain/mealSchema'
import { buildMealSuggestContext, remainingToday } from '../../domain/mealSuggestContext'
import { seenNames, splitByKind, webSearchUrl } from '../../domain/recipes'
import { formatDecimal } from '../../domain/number'
import { getMealSuggestInputs } from '../../db/mealSuggest'
import { AiRequestError, callAi } from '../../lib/aiClient'
import { useFoodUi } from '../../store/foodUi'
import { MealPicker } from './MealPicker'
import { openAteIt, RecipeView } from './RecipeView'

type Step = { kind: 'compose' } | { kind: 'loading' } | { kind: 'results' } | { kind: 'error'; message: string } | { kind: 'recipe'; option: Suggestion }

const n0 = (n: number) => formatDecimal(Math.round(n))
const REQUEST_MAX = 200

/** "¿Qué como?": 6 opciones con IA ajustadas a lo que queda hoy, con receta, búsqueda web y registro. */
export default function SuggestFlow({ mealType, today }: { mealType: MealType; today: string }) {
  const close = useFoodUi((s) => s.close)
  const inputs = useLiveQuery(() => getMealSuggestInputs(today), [today])
  const [meal, setMeal] = useState<MealType>(mealType)
  const [request, setRequest] = useState('')
  const [batches, setBatches] = useState<Suggestion[][]>([])
  const [notice, setNotice] = useState<string>()
  const [step, setStep] = useState<Step>({ kind: 'compose' })
  // Cada petición lleva un número: si se cancela (o se lanza otra), su respuesta se ignora
  const requestId = useRef(0)

  if (!inputs) return <p className="py-8 text-center text-neutral-400">Cargando…</p>
  const { overview, prefs, goal, recentNames } = inputs

  if (!overview.ready || !goal) {
    return (
      <Missing onClose={close}>
        {overview.ready ? 'Completa tu perfil' : overview.missing === 'profile' ? 'Completa tu perfil' : 'Registra tu peso'} para saber cuánto te queda hoy.
      </Missing>
    )
  }
  if (!prefs) {
    return <Missing onClose={close}>Rellena tus preferencias de comida (dieta, presupuesto, utensilios y tiempo) en Perfil › Comidas para que la IA pueda recomendarte.</Missing>
  }

  const target = overview.target
  const consumed = overview.today
  const remaining = remainingToday(target, consumed)

  async function recommend(exclude: Suggestion[][]) {
    const id = ++requestId.current
    setStep({ kind: 'loading' })
    try {
      const context = buildMealSuggestContext({ meal, goal: goal!, target, consumed, prefs: prefs!, recentNames, request })
      const excluir = seenNames(exclude).slice(-60) // límite del servidor
      const r = await callAi<MealSuggestionsResponse>('/api/meal-suggestions', { context, ...(excluir.length ? { excluir } : {}) })
      if (id !== requestId.current) return
      setBatches([...exclude, r.opciones])
      setNotice(r.aviso)
      setStep({ kind: 'results' })
    } catch (err) {
      if (id !== requestId.current) return
      setStep({ kind: 'error', message: err instanceof AiRequestError ? err.message : 'No se pudieron calcular las opciones. Inténtalo de nuevo.' })
    }
  }
  const cancel = () => {
    requestId.current++
    setStep(batches.length ? { kind: 'results' } : { kind: 'compose' })
  }

  if (step.kind === 'recipe') {
    return <RecipeView option={step.option} prefs={prefs} mealType={meal} onBack={() => setStep({ kind: 'results' })} />
  }

  if (step.kind === 'loading') return <Searching onCancel={cancel} />

  if (step.kind === 'results' && batches.length) {
    const current = batches.at(-1)!
    const { simple, elaborate } = splitByKind(current)
    return (
      <div className="space-y-5">
        {notice && (
          <p role="status" className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            {notice}
          </p>
        )}
        <Section title="Rápidas" options={simple} onRecipe={(o) => setStep({ kind: 'recipe', option: o })} meal={meal} />
        <Section title="Más elaboradas" options={elaborate} onRecipe={(o) => setStep({ kind: 'recipe', option: o })} meal={meal} />
        <button type="button" onClick={() => recommend(batches)} className="h-12 w-full rounded-xl bg-accent font-semibold text-bg active:scale-[0.98]">
          Otras opciones
        </button>
        <button type="button" onClick={() => setStep({ kind: 'compose' })} className="h-11 w-full rounded-xl border border-border font-semibold">
          Cambiar la petición
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-4" aria-label="Lo que te queda hoy">
        {remaining.kcal > 0 ? (
          <>
            <p className="text-sm text-neutral-400">Te quedan hoy</p>
            <p className="text-2xl font-bold tabular-nums">{n0(remaining.kcal)} kcal</p>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-400">Hoy ya has llegado a tu objetivo</p>
            <p className="text-2xl font-bold tabular-nums">{remaining.kcal === 0 ? '0 kcal' : `${n0(-remaining.kcal)} kcal por encima`}</p>
            <p className="mt-1 text-sm text-neutral-400">Te propondré opciones ligeras.</p>
          </>
        )}
        <p className="mt-1 text-sm text-neutral-300 tabular-nums">
          Proteína {n0(Math.max(0, remaining.proteina))} g · Carbohidratos {n0(Math.max(0, remaining.carbohidratos))} g · Grasa {n0(Math.max(0, remaining.grasa))} g
        </p>
      </section>

      <MealPicker meal={meal} setMeal={setMeal} />

      <label className="block">
        <span className="mb-1 block text-sm text-neutral-400">¿Algo en especial? (opcional)</span>
        <input
          type="text"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          maxLength={REQUEST_MAX}
          placeholder="Ej.: algo con pollo, tengo arroz y huevos, rápido que llego tarde"
          className="h-12 w-full rounded-xl border border-border bg-surface px-3 outline-none focus:border-accent/60"
        />
      </label>

      {step.kind === 'error' && (
        <p role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-red-200">
          {step.message}
        </p>
      )}

      <button type="button" onClick={() => recommend([])} className="h-12 w-full rounded-xl bg-accent font-semibold text-bg active:scale-[0.98]">
        Recomendar
      </button>
      <p className="text-xs text-neutral-500">Tiene en cuenta tus preferencias de Perfil y lo que has comido los últimos días.</p>
    </div>
  )
}

function Missing({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <p role="alert" className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-amber-100">
        {children}
      </p>
      <Link to="/perfil" onClick={onClose} className="flex h-12 items-center justify-center rounded-xl bg-accent font-semibold text-bg">
        Ir a Perfil
      </Link>
    </div>
  )
}

/** Carga con el tiempo que lleva: a los 15 s avisa de que tarda, y siempre se puede cancelar. */
function Searching({ onCancel }: { onCancel: () => void }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex flex-col items-center gap-3 py-12" role="status" aria-live="polite">
      <span aria-hidden className="size-10 animate-spin rounded-full border-4 border-accent/30 border-t-accent" />
      <span className="font-semibold">Buscando qué te encaja…</span>
      <span className="text-center text-sm text-neutral-400">
        {seconds < 15 ? 'Suele tardar unos 10-20 segundos' : 'Está tardando más de lo normal. Puede tardar hasta un minuto.'}
      </span>
      <button type="button" onClick={onCancel} className="mt-2 h-11 rounded-xl border border-border px-6 font-semibold">
        Cancelar
      </button>
    </div>
  )
}

function Section({ title, options, onRecipe, meal }: { title: string; options: Suggestion[]; onRecipe: (o: Suggestion) => void; meal: MealType }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold tracking-wide text-neutral-400 uppercase">{title}</h3>
      {options.length === 0 && <p className="text-sm text-neutral-500">Sin opciones de este tipo esta vez.</p>}
      <ul className="space-y-2">
        {options.map((o) => (
          <li key={o.id} className="rounded-2xl border border-border bg-surface p-3.5">
            <div className="flex items-start justify-between gap-3">
              <h4 className="font-semibold">{o.nombre}</h4>
              <span className="shrink-0 text-sm text-neutral-400 tabular-nums">{o.tiempoMin} min</span>
            </div>
            <p className="mt-0.5 text-sm text-neutral-200 tabular-nums">
              {n0(o.kcal)} kcal · {n0(o.proteina)} g proteína
            </p>
            <p className="mt-1 text-sm text-neutral-400">{o.porQueEncaja}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <button type="button" onClick={() => onRecipe(o)} className="col-span-2 h-10 rounded-lg bg-accent/15 font-semibold text-accent">
                Ver receta
              </button>
              <a href={webSearchUrl(o.nombre)} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center justify-center rounded-lg border border-border font-semibold">
                Buscar en la web
              </a>
              <button type="button" onClick={() => openAteIt(o, meal)} className="h-10 rounded-lg border border-border font-semibold">
                Me la he comido
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

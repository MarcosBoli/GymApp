import { useState, type ChangeEvent } from 'react'
import type { MealType } from '../../domain/types'
import { MEAL_TYPES, parseGrams } from '../../domain/food'
import { FOOD_DESCRIPTION_MAX, type Confidence, type FoodEstimateResponse } from '../../domain/foodEstimateSchema'
import { addRound, answerOptions, buildEstimateRequest, estimateSource, selectAnswer, validateEstimateInput, type QuestionRound } from '../../domain/foodEstimate'
import {
  addDraftItem,
  CONFIDENCE_LABELS,
  draftFromEstimate,
  draftItemNutrition,
  draftTotals,
  EMPTY_MANUAL_ITEM,
  removeDraftItem,
  SAVE_TO_LABELS,
  setDraftGrams,
  validateManualItem,
  type FoodDraftItem,
  type ManualItemForm,
} from '../../domain/foodDraft'
import { formatDecimal } from '../../domain/number'
import { saveEstimatedFoods } from '../../db/food'
import { AiRequestError, callAi } from '../../lib/aiClient'
import { clearDescribeDraft, loadDescribeDraft, saveDescribeDraft } from '../../lib/describeDraft'
import { PhotoReadError, preparePhoto, type PreparedPhoto } from '../../lib/photo'
import { useFoodUi } from '../../store/foodUi'

type Step =
  | { kind: 'compose'; error?: string }
  | { kind: 'loading' }
  | { kind: 'questions' }
  | { kind: 'error'; message: string }
  | { kind: 'notFood'; comment: string }
  | { kind: 'draft'; items: FoodDraftItem[]; comment: string }

const kcal = (n: number) => formatDecimal(Math.round(n))
const g1 = (n: number) => formatDecimal(Math.round(n * 10) / 10)

/**
 * Registrar una comida con IA describiéndola, con una foto o con ambas. Si a la IA le falta
 * algo importante pregunta (chips de respuesta rápida); el resultado es un borrador editable
 * que se guarda como alimentos reutilizables. La foto no se guarda.
 */
export default function EstimateFlow({ mode, mealType, date }: { mode: 'photo' | 'text'; mealType: MealType; date: string }) {
  const close = useFoodUi((s) => s.close)
  const [step, setStep] = useState<Step>({ kind: 'compose' })
  const [text, setText] = useState(() => (mode === 'text' ? loadDescribeDraft() : ''))
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null)
  const [rounds, setRounds] = useState<QuestionRound[]>([])
  const [meal, setMeal] = useState<MealType>(mealType)
  const [saving, setSaving] = useState(false)

  function onText(value: string) {
    setText(value)
    if (mode === 'text') saveDescribeDraft(value)
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite elegir la misma foto otra vez
    if (!file) return
    try {
      setPhoto(await preparePhoto(file))
      setStep({ kind: 'compose' })
    } catch (err) {
      setStep({ kind: 'compose', error: err instanceof PhotoReadError ? err.message : 'No se pudo preparar la foto.' })
    }
  }

  async function request(currentRounds: QuestionRound[]) {
    setStep({ kind: 'loading' })
    try {
      const { result } = await callAi<FoodEstimateResponse>('/api/food-estimate', buildEstimateRequest({ description: text, image: photo?.base64, rounds: currentRounds }))
      if (result.type === 'questions') {
        setRounds(addRound(currentRounds, result.questions))
        setStep({ kind: 'questions' })
      } else if (!result.reconocida || result.items.length === 0) {
        setStep({ kind: 'notFood', comment: result.comentario })
      } else {
        setStep({ kind: 'draft', items: draftFromEstimate(result), comment: result.comentario })
      }
    } catch (err) {
      setStep({ kind: 'error', message: err instanceof AiRequestError ? err.message : 'No se pudo calcular. Inténtalo de nuevo.' })
    }
  }

  function start() {
    const error = validateEstimateInput(text, photo !== null)
    if (error) return setStep({ kind: 'compose', error })
    setRounds([])
    void request([])
  }

  function edit() {
    setRounds([])
    setStep({ kind: 'compose' })
  }

  async function save(items: FoodDraftItem[]) {
    setSaving(true)
    try {
      await saveEstimatedFoods(date, meal, items, estimateSource(photo !== null), Date.now())
      clearDescribeDraft()
      close()
    } finally {
      setSaving(false)
    }
  }

  if (step.kind === 'draft') {
    return (
      <Draft
        step={step}
        photo={photo}
        meal={meal}
        setMeal={setMeal}
        saving={saving}
        onChange={(items) => setStep({ ...step, items })}
        onSave={save}
        onRestart={edit}
      />
    )
  }

  if (step.kind === 'loading') {
    return (
      <div className="space-y-4">
        {photo && <img src={photo.dataUrl} alt="Foto de la comida" className="max-h-60 w-full rounded-2xl border border-border object-cover opacity-40" />}
        <div className="flex flex-col items-center gap-3 py-8" role="status" aria-live="polite">
          <span aria-hidden className="size-10 animate-spin rounded-full border-4 border-accent/30 border-t-accent" />
          <span className="font-semibold">{photo ? 'Analizando la foto…' : 'Calculando…'}</span>
          <span className="text-sm text-neutral-400">Suele tardar entre 5 y 20 segundos</span>
        </div>
      </div>
    )
  }

  if (step.kind === 'questions') {
    const round = rounds.at(-1)!
    return (
      <div className="space-y-5">
        <p className="text-neutral-300">Para afinar la estimación:</p>
        {round.questions.map((q) => (
          <fieldset key={q.id}>
            <legend className="mb-2 font-semibold">{q.texto}</legend>
            <div className="flex flex-wrap gap-2">
              {answerOptions(q).map((option) => {
                const selected = round.answers[q.id] === option
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setRounds([...rounds.slice(0, -1), selectAnswer(round, q.id, option)])}
                    className={`min-h-10 rounded-full border px-3.5 py-1.5 text-sm ${selected ? 'border-accent bg-accent font-semibold text-bg' : 'border-border text-neutral-200 active:bg-white/5'}`}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}
        <p className="text-xs text-neutral-500">Si no contestas una pregunta, cuenta como «No lo sé» y se usará lo más habitual.</p>
        <button type="button" onClick={() => request(rounds)} className="h-12 w-full rounded-xl bg-accent font-semibold text-bg active:scale-[0.98]">
          Calcular
        </button>
        <button type="button" onClick={edit} className="h-11 w-full rounded-xl border border-border font-semibold">
          Cambiar la descripción
        </button>
      </div>
    )
  }

  if (step.kind === 'error' || step.kind === 'notFood') {
    return (
      <div className="space-y-4">
        {step.kind === 'error' ? (
          <p role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-red-200">{step.message}</p>
        ) : (
          <div role="alert" className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2">
            <p className="font-semibold text-amber-200">{photo ? 'No he reconocido comida en la foto' : 'No he reconocido comida en la descripción'}</p>
            {step.comment && <p className="mt-1 text-sm text-amber-100/80">{step.comment}</p>}
          </div>
        )}
        {step.kind === 'error' && (
          <button type="button" onClick={() => request(rounds)} className="h-12 w-full rounded-xl bg-accent font-semibold text-bg">
            Reintentar
          </button>
        )}
        <button type="button" onClick={edit} className={`h-11 w-full rounded-xl font-semibold ${step.kind === 'notFood' ? 'bg-accent text-bg' : 'border border-border'}`}>
          {photo ? 'Cambiar la foto o la nota' : 'Cambiar la descripción'}
        </button>
      </div>
    )
  }

  // Redactar: texto y/o foto + comida
  const photoFirst = mode === 'photo'
  return (
    <div className="space-y-4">
      {photo ? (
        <div className="relative">
          <img src={photo.dataUrl} alt="Foto de la comida" className="max-h-60 w-full rounded-2xl border border-border object-cover" />
          <button type="button" onClick={() => setPhoto(null)} className="absolute top-2 right-2 rounded-full bg-black/70 px-3 py-1 text-sm font-semibold">
            Quitar foto
          </button>
        </div>
      ) : photoFirst ? (
        <div className="space-y-3">
          <p className="text-neutral-300">Haz una foto del plato y la IA estimará los alimentos, los gramos y las calorías. Luego podrás corregirlo antes de guardar.</p>
          <div className="grid gap-3">
            <PickButton label="Hacer foto" capture onChange={onFile} primary />
            <PickButton label="Elegir de la galería" onChange={onFile} />
          </div>
        </div>
      ) : null}

      {(!photoFirst || photo) && (
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-400">{photo ? 'Nota opcional (cantidades, ingredientes, cómo se cocinó…)' : '¿Qué has comido?'}</span>
          <textarea
            value={text}
            onChange={(e) => onText(e.target.value)}
            maxLength={FOOD_DESCRIPTION_MAX}
            rows={photo ? 2 : 4}
            placeholder={photo ? 'Ej.: 2 huevos fritos en aceite de oliva' : 'Ej: un plato de macarrones con tomate y queso, y una manzana'}
            className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2.5 outline-none focus:border-accent/60"
          />
        </label>
      )}

      {!photoFirst && !photo && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">Añadir foto (opcional):</span>
          <PickButton label="Cámara" capture onChange={onFile} small />
          <PickButton label="Galería" onChange={onFile} small />
        </div>
      )}

      {step.error && <p role="alert" className="text-sm text-red-300">{step.error}</p>}

      {(!photoFirst || photo) && (
        <>
          <MealPicker meal={meal} setMeal={setMeal} />
          <button type="button" onClick={start} className="h-12 w-full rounded-xl bg-accent font-semibold text-bg active:scale-[0.98]">
            {photo ? 'Analizar con IA' : 'Calcular'}
          </button>
        </>
      )}
      <p className="text-xs text-neutral-500">{photo || photoFirst ? 'La foto no se guarda: solo la estimación.' : 'Si falta algo importante, te preguntaré antes de calcular.'}</p>
    </div>
  )
}

function PickButton(props: { label: string; capture?: boolean; primary?: boolean; small?: boolean; onChange: (e: ChangeEvent<HTMLInputElement>) => void }) {
  const style = props.small
    ? 'h-9 rounded-lg border border-border px-3 text-sm'
    : `h-12 rounded-xl ${props.primary ? 'bg-accent text-bg' : 'border border-border'}`
  return (
    <label className={`flex cursor-pointer items-center justify-center font-semibold active:scale-[0.98] ${style}`}>
      {props.label}
      {/* Con capture iOS abre la cámara directamente; sin capture deja elegir de la fototeca */}
      <input type="file" accept="image/*" {...(props.capture ? { capture: 'environment' as const } : {})} onChange={props.onChange} className="sr-only" />
    </label>
  )
}

function MealPicker({ meal, setMeal }: { meal: MealType; setMeal: (m: MealType) => void }) {
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

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  alta: 'border-emerald-400/40 text-emerald-300',
  media: 'border-amber-400/40 text-amber-300',
  baja: 'border-red-400/40 text-red-300',
}

function Draft(props: {
  step: Extract<Step, { kind: 'draft' }>
  photo: PreparedPhoto | null
  meal: MealType
  setMeal: (m: MealType) => void
  saving: boolean
  onChange: (items: FoodDraftItem[]) => void
  onSave: (items: FoodDraftItem[]) => void
  onRestart: () => void
}) {
  const { step, photo, meal, setMeal, saving, onChange, onSave } = props
  const [adding, setAdding] = useState(false)
  const totals = draftTotals(step.items)

  return (
    <div className="space-y-4">
      <section className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3" aria-label="Totales">
        {photo && <img src={photo.dataUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />}
        <div className="min-w-0">
          <div className="text-2xl font-bold tabular-nums">{kcal(totals.kcal)} kcal</div>
          <div className="text-sm text-neutral-300 tabular-nums">
            P {g1(totals.proteinG)} g · C {g1(totals.carbsG)} g · G {g1(totals.fatG)} g
          </div>
        </div>
      </section>
      {step.comment && <p className="text-sm text-neutral-400">{step.comment}</p>}

      <ul className="space-y-2">
        {step.items.map((item) => (
          <DraftRow key={item.key} item={item} onGrams={(g) => onChange(setDraftGrams(step.items, item.key, g))} onRemove={() => onChange(removeDraftItem(step.items, item.key))} />
        ))}
      </ul>
      {step.items.length === 0 && <p className="text-sm text-neutral-500">No queda ningún alimento. Añade uno o vuelve a empezar.</p>}

      {adding ? (
        <ManualItem
          onCancel={() => setAdding(false)}
          onAdd={(v) => {
            onChange(addDraftItem(step.items, v))
            setAdding(false)
          }}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="h-11 w-full rounded-xl border border-dashed border-accent/40 font-semibold text-accent active:bg-accent/10">
          + Añadir alimento
        </button>
      )}

      <MealPicker meal={meal} setMeal={setMeal} />

      <button
        type="button"
        disabled={saving || step.items.length === 0}
        onClick={() => onSave(step.items)}
        className="h-12 w-full rounded-xl bg-accent font-semibold text-bg active:scale-[0.98] disabled:opacity-40"
      >
        {SAVE_TO_LABELS[meal]}
      </button>
      <button type="button" onClick={props.onRestart} className="h-11 w-full rounded-xl border border-border font-semibold">
        Descartar y empezar de nuevo
      </button>
      <p className="text-xs text-neutral-500">Es una estimación: revisa los gramos y los supuestos. Los alimentos se guardan para reutilizarlos sin volver a usar la IA.</p>
    </div>
  )
}

function DraftRow({ item, onGrams, onRemove }: { item: FoodDraftItem; onGrams: (g: number) => void; onRemove: () => void }) {
  const [text, setText] = useState(formatDecimal(item.grams))
  const n = draftItemNutrition(item)
  const invalid = parseGrams(text) === null
  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{item.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {item.confidence ? (
              <span className={`rounded-full border px-2 py-0.5 ${CONFIDENCE_STYLE[item.confidence]}`}>Confianza {CONFIDENCE_LABELS[item.confidence].toLowerCase()}</span>
            ) : (
              <span className="rounded-full border border-border px-2 py-0.5 text-neutral-400">Añadido a mano</span>
            )}
          </div>
          {item.assumption && <p className="mt-1 text-xs text-neutral-400">Supuesto: {item.assumption}</p>}
        </div>
        <button type="button" onClick={onRemove} aria-label={`Quitar ${item.name}`} className="-mt-1 -mr-1 p-2 text-neutral-500 active:text-red-300">
          ✕
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <label className="flex items-center gap-1.5">
          <input
            type="text"
            inputMode="decimal"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              const g = parseGrams(e.target.value)
              if (g !== null) onGrams(g)
            }}
            aria-label={`Gramos de ${item.name}`}
            aria-invalid={invalid}
            className={`h-10 w-20 rounded-lg border bg-bg px-2 text-right tabular-nums outline-none focus:border-accent/60 ${invalid ? 'border-red-400/60' : 'border-border'}`}
          />
          <span className="text-neutral-400">g</span>
        </label>
        <div className="min-w-0 flex-1 text-right text-sm tabular-nums">
          <div className="font-semibold">{kcal(n.kcal)} kcal</div>
          <div className="text-neutral-400">
            P {g1(n.proteinG)} · C {g1(n.carbsG)} · G {g1(n.fatG)}
          </div>
        </div>
      </div>
    </li>
  )
}

function ManualItem({ onAdd, onCancel }: { onAdd: (v: { name: string; grams: number; portion: { kcal: number; proteinG: number; carbsG: number; fatG: number } }) => void; onCancel: () => void }) {
  const [form, setForm] = useState<ManualItemForm>(EMPTY_MANUAL_ITEM)
  const [errors, setErrors] = useState<Partial<Record<keyof ManualItemForm, string>>>({})
  const field = (key: keyof ManualItemForm, label: string, decimal = true) => (
    <label className="block">
      <span className="mb-0.5 block text-xs text-neutral-400">{label}</span>
      <input
        type="text"
        inputMode={decimal ? 'decimal' : 'text'}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        aria-invalid={Boolean(errors[key])}
        className="h-10 w-full rounded-lg border border-border bg-bg px-2 outline-none focus:border-accent/60"
      />
      {errors[key] && <span className="text-xs text-red-300">{errors[key]}</span>}
    </label>
  )
  return (
    <div className="space-y-2 rounded-xl border border-accent/30 p-3">
      <p className="text-sm font-semibold">Añadir alimento (valores de la porción)</p>
      {field('name', 'Nombre', false)}
      <div className="grid grid-cols-2 gap-2">
        {field('grams', 'Gramos')}
        {field('kcal', 'kcal')}
        {field('proteinG', 'Proteína (g)')}
        {field('carbsG', 'Carbohidratos (g)')}
        {field('fatG', 'Grasa (g)')}
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button type="button" onClick={onCancel} className="h-10 rounded-lg border border-border font-semibold">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => {
            const r = validateManualItem(form)
            if (r.ok) onAdd(r.value)
            else setErrors(r.errors)
          }}
          className="h-10 rounded-lg bg-accent font-semibold text-bg"
        >
          Añadir
        </button>
      </div>
    </div>
  )
}

import { useState, type ChangeEvent } from 'react'
import type { MealType } from '../../domain/types'
import { MEAL_TYPES, parseGrams } from '../../domain/food'
import { FOOD_PHOTO_NOTE_MAX, type Confidence, type FoodPhotoResponse } from '../../domain/foodPhotoSchema'
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
  type ManualItemForm,
  type PhotoDraftItem,
} from '../../domain/foodPhoto'
import { formatDecimal } from '../../domain/number'
import { saveFoodPhotoEstimate } from '../../db/food'
import { AiRequestError, callAi } from '../../lib/aiClient'
import { PhotoReadError, preparePhoto, type PreparedPhoto } from '../../lib/photo'
import { useFoodUi } from '../../store/foodUi'

type Step =
  | { kind: 'pick'; error?: string }
  | { kind: 'ready'; photo: PreparedPhoto }
  | { kind: 'analyzing'; photo: PreparedPhoto }
  | { kind: 'error'; photo: PreparedPhoto; message: string }
  | { kind: 'notFood'; photo: PreparedPhoto; comment: string }
  | { kind: 'draft'; photo: PreparedPhoto; items: PhotoDraftItem[]; comment: string }

const kcal = (n: number) => formatDecimal(Math.round(n))
const g1 = (n: number) => formatDecimal(Math.round(n * 10) / 10)

/** Registrar una comida con una foto: la IA estima, el usuario corrige y se guarda (la foto no). */
export default function PhotoFlow({ mealType, date }: { mealType: MealType; date: string }) {
  const close = useFoodUi((s) => s.close)
  const [step, setStep] = useState<Step>({ kind: 'pick' })
  const [note, setNote] = useState('')
  const [meal, setMeal] = useState<MealType>(mealType)
  const [saving, setSaving] = useState(false)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite elegir la misma foto otra vez
    if (!file) return
    try {
      setStep({ kind: 'ready', photo: await preparePhoto(file) })
    } catch (err) {
      setStep({ kind: 'pick', error: err instanceof PhotoReadError ? err.message : 'No se pudo preparar la foto.' })
    }
  }

  async function analyze(photo: PreparedPhoto) {
    setStep({ kind: 'analyzing', photo })
    try {
      const trimmed = note.trim()
      const r = await callAi<FoodPhotoResponse>('/api/food-photo', { image: photo.base64, ...(trimmed ? { note: trimmed } : {}) })
      const { estimate } = r
      if (!estimate.reconocida || estimate.items.length === 0) setStep({ kind: 'notFood', photo, comment: estimate.comentario })
      else setStep({ kind: 'draft', photo, items: draftFromEstimate(estimate), comment: estimate.comentario })
    } catch (err) {
      setStep({ kind: 'error', photo, message: err instanceof AiRequestError ? err.message : 'No se pudo analizar la foto. Inténtalo de nuevo.' })
    }
  }

  async function save(items: PhotoDraftItem[]) {
    setSaving(true)
    try {
      await saveFoodPhotoEstimate(date, meal, items, Date.now())
      close()
    } finally {
      setSaving(false)
    }
  }

  if (step.kind === 'pick') {
    return (
      <div className="space-y-4">
        <p className="text-neutral-300">Haz una foto del plato y la IA estimará los alimentos, los gramos y las calorías. Luego podrás corregirlo antes de guardar.</p>
        <div className="grid gap-3">
          <PickButton label="Hacer foto" capture onChange={onFile} primary />
          <PickButton label="Elegir de la galería" onChange={onFile} />
        </div>
        {step.error && <p role="alert" className="text-sm text-red-300">{step.error}</p>}
        <p className="text-xs text-neutral-500">La foto no se guarda en el móvil ni en la app: solo la estimación.</p>
      </div>
    )
  }

  if (step.kind === 'draft') {
    return <Draft step={step} meal={meal} setMeal={setMeal} saving={saving} onChange={(items) => setStep({ ...step, items })} onSave={save} onRestart={() => setStep({ kind: 'pick' })} />
  }

  const { photo } = step
  const analyzing = step.kind === 'analyzing'
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border">
        <img src={photo.dataUrl} alt="Foto de la comida" className={`max-h-72 w-full object-cover ${analyzing ? 'opacity-40' : ''}`} />
        {analyzing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" role="status" aria-live="polite">
            <span aria-hidden className="size-10 animate-spin rounded-full border-4 border-accent/30 border-t-accent" />
            <span className="font-semibold">Analizando la foto…</span>
            <span className="text-sm text-neutral-300">Suele tardar entre 5 y 20 segundos</span>
          </div>
        )}
      </div>

      {step.kind === 'ready' && (
        <>
          <label className="block">
            <span className="mb-1 block text-sm text-neutral-400">Nota opcional (cantidades, ingredientes, cómo se cocinó…)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={FOOD_PHOTO_NOTE_MAX}
              rows={2}
              placeholder="Ej.: 2 huevos fritos en aceite de oliva"
              className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2.5 outline-none focus:border-accent/60"
            />
          </label>
          <button type="button" onClick={() => analyze(photo)} className="h-12 w-full rounded-xl bg-accent font-semibold text-bg active:scale-[0.98]">
            Analizar con IA
          </button>
          <button type="button" onClick={() => setStep({ kind: 'pick' })} className="h-11 w-full rounded-xl border border-border font-semibold active:bg-white/5">
            Cambiar foto
          </button>
        </>
      )}

      {step.kind === 'error' && (
        <>
          <p role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-red-200">{step.message}</p>
          <button type="button" onClick={() => analyze(photo)} className="h-12 w-full rounded-xl bg-accent font-semibold text-bg">Reintentar</button>
          <button type="button" onClick={() => setStep({ kind: 'pick' })} className="h-11 w-full rounded-xl border border-border font-semibold">Cambiar foto</button>
        </>
      )}

      {step.kind === 'notFood' && (
        <>
          <div role="alert" className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2">
            <p className="font-semibold text-amber-200">No he reconocido comida en la foto</p>
            {step.comment && <p className="mt-1 text-sm text-amber-100/80">{step.comment}</p>}
          </div>
          <button type="button" onClick={() => setStep({ kind: 'pick' })} className="h-12 w-full rounded-xl bg-accent font-semibold text-bg">Probar otra foto</button>
          <button type="button" onClick={() => setStep({ kind: 'ready', photo })} className="h-11 w-full rounded-xl border border-border font-semibold">Añadir una nota y reintentar</button>
        </>
      )}
    </div>
  )
}

function PickButton({ label, capture = false, primary = false, onChange }: { label: string; capture?: boolean; primary?: boolean; onChange: (e: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className={`flex h-12 cursor-pointer items-center justify-center rounded-xl font-semibold active:scale-[0.98] ${primary ? 'bg-accent text-bg' : 'border border-border'}`}>
      {label}
      {/* Con capture iOS abre la cámara directamente; sin capture deja elegir de la fototeca */}
      <input type="file" accept="image/*" {...(capture ? { capture: 'environment' as const } : {})} onChange={onChange} className="sr-only" />
    </label>
  )
}

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  alta: 'border-emerald-400/40 text-emerald-300',
  media: 'border-amber-400/40 text-amber-300',
  baja: 'border-red-400/40 text-red-300',
}

function Draft(props: {
  step: Extract<Step, { kind: 'draft' }>
  meal: MealType
  setMeal: (m: MealType) => void
  saving: boolean
  onChange: (items: PhotoDraftItem[]) => void
  onSave: (items: PhotoDraftItem[]) => void
  onRestart: () => void
}) {
  const { step, meal, setMeal, saving, onChange, onSave } = props
  const [adding, setAdding] = useState(false)
  const totals = draftTotals(step.items)

  return (
    <div className="space-y-4">
      <section className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3" aria-label="Totales">
        <img src={step.photo.dataUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
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
      {step.items.length === 0 && <p className="text-sm text-neutral-500">No queda ningún alimento. Añade uno o vuelve a hacer la foto.</p>}

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

      <button
        type="button"
        disabled={saving || step.items.length === 0}
        onClick={() => onSave(step.items)}
        className="h-12 w-full rounded-xl bg-accent font-semibold text-bg active:scale-[0.98] disabled:opacity-40"
      >
        {SAVE_TO_LABELS[meal]}
      </button>
      <button type="button" onClick={props.onRestart} className="h-11 w-full rounded-xl border border-border font-semibold">Descartar y hacer otra foto</button>
      <p className="text-xs text-neutral-500">Es una estimación: revisa los gramos. Los alimentos se guardan para reutilizarlos sin volver a usar la IA.</p>
    </div>
  )
}

function DraftRow({ item, onGrams, onRemove }: { item: PhotoDraftItem; onGrams: (g: number) => void; onRemove: () => void }) {
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
            {item.note && <span className="text-neutral-400">{item.note}</span>}
          </div>
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
        <button type="button" onClick={onCancel} className="h-10 rounded-lg border border-border font-semibold">Cancelar</button>
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

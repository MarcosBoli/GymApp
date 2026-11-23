import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ACTIVITY_LEVELS,
  DAYS_OPTIONS,
  EQUIPMENT_LABELS,
  GOALS,
  LIMITATIONS_MAX,
  MINUTES_OPTIONS,
  TRAINING_GOAL_LABELS,
  validateProfileForm,
  type ProfileErrors,
  type ProfileForm as Form,
} from '../../domain/profile'
import { PLAN_EQUIPMENT, TRAINING_GOALS } from '../../domain/planSchema'
import { formatDecimal } from '../../domain/number'
import { toDateKey } from '../../domain/dates'
import { db } from '../../db/db'
import { saveProfile } from '../../db/profile'
import { getBodyweightAt } from '../../db/workouts'

export function ProfileForm() {
  const initial = useLiveQuery(async (): Promise<Form> => {
    const [p, weight] = await Promise.all([db.userProfile.get('me'), getBodyweightAt(Date.now())])
    return {
      sex: p?.sex ?? '',
      birthDate: p?.birthDate ?? '',
      heightCm: p ? formatDecimal(p.heightCm) : '',
      weightKg: weight !== undefined ? formatDecimal(weight) : '',
      activityLevel: p?.activityLevel ?? 'moderate',
      goal: p?.goal ?? 'maintain',
      trainingGoal: p?.trainingGoal ?? 'hypertrophy',
      daysPerWeek: p?.daysPerWeek ?? 4,
      sessionMinutes: p?.sessionMinutes ?? 60,
      equipment: p?.equipment ?? [...PLAN_EQUIPMENT],
      limitations: p?.limitations ?? '',
    }
  })
  if (!initial) return null
  return <FormBody initial={initial} />
}

function FormBody({ initial }: { initial: Form }) {
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [saved, setSaved] = useState(false)
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm({ ...form, [key]: value })
    setSaved(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const now = Date.now()
    const result = validateProfileForm(form, toDateKey(new Date(now)))
    if (!result.ok) return setErrors(result.errors)
    setErrors({})
    await saveProfile(result.value, now)
    setSaved(true)
  }

  const input = 'h-12 w-full rounded-xl border border-border bg-bg/60 px-3 outline-none focus:border-accent/60'

  return (
    <form onSubmit={submit} className="mx-4 space-y-4 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">Datos personales</h2>

      <Field label="Sexo" error={errors.sex} group>
        <div className="grid grid-cols-2 gap-2">
          {(['male', 'female'] as const).map((sex) => (
            <button
              key={sex}
              type="button"
              onClick={() => set('sex', sex)}
              aria-pressed={form.sex === sex}
              className={`h-12 rounded-xl border font-medium ${form.sex === sex ? 'border-accent bg-accent/10 text-accent' : 'border-border text-zinc-400'}`}
            >
              {sex === 'male' ? 'Hombre' : 'Mujer'}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Peso (kg)" error={errors.weightKg}>
          <input className={input} type="text" inputMode="decimal" value={form.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
        </Field>
        <Field label="Altura (cm)" error={errors.heightCm}>
          <input className={input} type="text" inputMode="decimal" value={form.heightCm} onChange={(e) => set('heightCm', e.target.value)} />
        </Field>
      </div>

      <Field label="Fecha de nacimiento" error={errors.birthDate}>
        <input className={input} type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
      </Field>

      <Field label="Nivel de actividad">
        <select className={input} value={form.activityLevel} onChange={(e) => set('activityLevel', e.target.value as Form['activityLevel'])}>
          {ACTIVITY_LEVELS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Objetivo">
        <select className={input} value={form.goal} onChange={(e) => set('goal', e.target.value as Form['goal'])}>
          {GOALS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </Field>

      <h3 className="pt-2 text-base font-semibold">Entrenamiento</h3>
      <p className="-mt-2 text-sm text-zinc-500">La IA usa estos datos para diseñar tu rutina semanal.</p>

      <Field label="Objetivo" error={errors.trainingGoal} group>
        <Segmented options={TRAINING_GOALS.map((g) => ({ value: g, label: TRAINING_GOAL_LABELS[g] }))} value={form.trainingGoal} onChange={(v) => set('trainingGoal', v)} />
      </Field>

      <Field label="Días por semana" error={errors.daysPerWeek} group>
        <Segmented options={DAYS_OPTIONS.map((d) => ({ value: d, label: String(d) }))} value={form.daysPerWeek} onChange={(v) => set('daysPerWeek', v)} />
      </Field>

      <Field label="Minutos por sesión" error={errors.sessionMinutes}>
        <select className={input} value={form.sessionMinutes} onChange={(e) => set('sessionMinutes', Number(e.target.value))}>
          {MINUTES_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </Field>

      <Field label="Material disponible" error={errors.equipment} group>
        <div className="flex flex-wrap gap-2">
          {PLAN_EQUIPMENT.map((eq) => {
            const on = form.equipment.includes(eq)
            return (
              <button
                key={eq}
                type="button"
                aria-pressed={on}
                onClick={() => set('equipment', on ? form.equipment.filter((x) => x !== eq) : [...form.equipment, eq])}
                className={`h-10 rounded-full border px-4 text-sm font-medium ${on ? 'border-accent bg-accent/10 text-accent' : 'border-border text-zinc-400'}`}
              >
                {on ? '✓ ' : ''}
                {EQUIPMENT_LABELS[eq]}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Lesiones o limitaciones (opcional)" error={errors.limitations}>
        <textarea
          className={`${input} h-24 py-2`}
          maxLength={LIMITATIONS_MAX}
          value={form.limitations}
          onChange={(e) => set('limitations', e.target.value)}
          placeholder="Ej.: molestia en el hombro derecho al press por encima de la cabeza"
        />
      </Field>

      <button type="submit" className="h-12 w-full rounded-xl bg-accent font-semibold text-bg active:scale-[0.98]">
        {saved ? 'Guardado ✓' : 'Guardar'}
      </button>
    </form>
  )
}

function Segmented<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-12 flex-1 rounded-xl border text-sm font-medium ${value === o.value ? 'border-accent bg-accent/10 text-accent' : 'border-border text-zinc-400'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Campo con etiqueta. `group`: para grupos de botones (un <label> no puede envolverlos). */
function Field({ label, error, group, children }: { label: string; error?: string; group?: boolean; children: React.ReactNode }) {
  const content = (
    <>
      <span className="mb-1 block text-sm text-zinc-400">{label}</span>
      {children}
      {error && <span className="mt-1 block text-sm text-red-300">{error}</span>}
    </>
  )
  return group ? (
    <div role="group" aria-label={label}>
      {content}
    </div>
  ) : (
    <label className="block">{content}</label>
  )
}

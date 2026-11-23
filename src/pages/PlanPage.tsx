import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import type { PlanDay, PlanExercise, WeeklyPlan } from '../domain/types'
import {
  addPlanExercise,
  DAY_NAMES,
  equivalentExercises,
  formatPlanTarget,
  removePlanExercise,
  suggestWeight,
  swapExercise,
  updatePlanExercise,
} from '../domain/plan'
import { buildExerciseIndex, searchExercises } from '../domain/workout'
import { addDays, fromDateKey } from '../domain/dates'
import { db } from '../db/db'
import { editPlanDays, getWeekStatus, listPlanVersions, savePlanVersion } from '../db/plans'
import { getRecentE1RMs } from '../db/planGeneration'
import { getBodyweightAt, getCatalog, type Catalog } from '../db/workouts'
import { usePlanUi } from '../store/planUi'
import { PageHeader } from '../components/layout/PageHeader'
import { Sheet } from '../components/Sheet'
import { currentWeekStart, todayKey } from '../components/plan/weekDates'

const dateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
const versionFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

type Picker = { kind: 'swap'; dayIndex: number; position: number; exerciseId: string } | { kind: 'add'; dayIndex: number } | null

export default function PlanPage() {
  const weekStart = currentWeekStart()
  const status = useLiveQuery(() => getWeekStatus(weekStart, todayKey()), [weekStart])
  const catalog = useLiveQuery(() => getCatalog())
  const versions = useLiveQuery(() => listPlanVersions(weekStart), [weekStart])
  const profile = useLiveQuery(async () => ({ p: await db.userProfile.get('me'), bw: await getBodyweightAt(Date.now()) }))
  const plan = status?.plan
  const weights = useLiveQuery(
    async () => (plan ? getRecentE1RMs(plan.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)), Date.now(), profile?.bw) : new Map<string, number>()),
    [plan?.id, profile?.bw],
  )
  const openGenerator = usePlanUi((s) => s.openGenerator)
  const [draft, setDraft] = useState<PlanDay[] | null>(null)
  const [picker, setPicker] = useState<Picker>(null)
  const [showHistory, setShowHistory] = useState(false)

  if (!status || !catalog || !versions || !profile) return null
  const range = `${dateFmt.format(fromDateKey(weekStart))} – ${dateFmt.format(fromDateKey(addDays(weekStart, 6)))}`

  if (!plan) {
    return (
      <>
        <PageHeader title="Rutina" />
        <div className="space-y-4 px-4">
          <p className="text-zinc-400">Semana del {range}. Aún no hay rutina.</p>
          <button type="button" onClick={openGenerator} className="h-14 w-full rounded-2xl bg-accent text-lg font-bold text-bg">
            Generar con IA
          </button>
          <Link to="/entrenar" className="block text-center text-sm text-zinc-400">Volver a Entrenar</Link>
        </div>
      </>
    )
  }

  const days = draft ?? plan.days
  const editing = draft !== null
  const equipment = profile.p?.equipment ?? ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight']

  async function save() {
    if (!draft || !plan) return
    await editPlanDays(plan.id, draft, Date.now())
    setDraft(null)
  }

  async function restore(v: WeeklyPlan) {
    if (!window.confirm(`¿Restaurar la versión del ${versionFmt.format(v.createdAt)}?`)) return
    const { id: _i, status: _s, createdAt: _c, ...rest } = v
    await savePlanVersion(rest, Date.now())
  }

  return (
    <>
      <PageHeader title="Rutina">
        <Link to="/entrenar" className="pb-1 text-sm font-medium text-accent">Entrenar</Link>
      </PageHeader>
      <div className="space-y-4 px-4">
        <p className="text-sm text-zinc-400">
          Semana del {range} · {plan.source === 'ai' ? `IA${plan.model ? ` (${plan.model})` : ''}` : 'editada a mano'}
        </p>
        {plan.reasoning && <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-zinc-300">{plan.reasoning}</p>}

        {days.map((d) => (
          <section key={d.dayIndex} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {DAY_NAMES[d.dayIndex]} · {d.name}
              </h2>
              {status.done.has(d.dayIndex) ? (
                <span className="text-sm font-semibold text-emerald-300">Hecho ✓</span>
              ) : status.next?.dayIndex === d.dayIndex ? (
                <span className="text-sm font-semibold text-accent">Toca</span>
              ) : null}
            </div>
            <ul className="mt-2 divide-y divide-border/60">
              {d.exercises.map((e, i) => (
                <ExerciseRow
                  key={`${e.exerciseId}-${i}`}
                  exercise={e}
                  catalog={catalog}
                  weight={suggestWeight(weights?.get(e.exerciseId), e, catalog.exerciseById.get(e.exerciseId)?.equipment ?? 'other', profile.bw)}
                  editing={editing}
                  onChange={(patch) => setDraft(updatePlanExercise(days, d.dayIndex, i, patch))}
                  onSwap={() => setPicker({ kind: 'swap', dayIndex: d.dayIndex, position: i, exerciseId: e.exerciseId })}
                  onRemove={() => setDraft(removePlanExercise(days, d.dayIndex, i))}
                />
              ))}
            </ul>
            {editing && (
              <button type="button" onClick={() => setPicker({ kind: 'add', dayIndex: d.dayIndex })} className="mt-2 h-10 w-full rounded-xl border border-dashed border-accent/40 text-sm font-semibold text-accent">
                + Añadir ejercicio
              </button>
            )}
          </section>
        ))}

        <p className="text-xs text-zinc-500">Los pesos los calcula la app con tu mejor e1RM de los últimos 90 días, el rango de repeticiones y el RPE objetivo.</p>

        {editing ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDraft(null)} className="h-12 rounded-xl border border-border font-semibold">Cancelar</button>
            <button type="button" onClick={save} className="h-12 rounded-xl bg-accent font-semibold text-bg">Guardar cambios</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDraft(plan.days)} className="h-12 rounded-xl border border-border font-semibold">Editar</button>
            <button type="button" onClick={openGenerator} className="h-12 rounded-xl border border-accent/50 font-semibold text-accent">Regenerar con IA</button>
          </div>
        )}

        {versions.length > 1 && (
          <section className="pb-4">
            <button type="button" onClick={() => setShowHistory(!showHistory)} className="text-sm font-medium text-zinc-400" aria-expanded={showHistory}>
              Historial de esta semana ({versions.length} versiones) {showHistory ? '▲' : '▼'}
            </button>
            {showHistory && (
              <ul className="mt-2 space-y-2">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-sm">
                    <span>
                      {versionFmt.format(v.createdAt)} · {v.source === 'ai' ? 'IA' : 'a mano'}
                      {v.status === 'active' && <span className="ml-2 text-emerald-300">actual</span>}
                    </span>
                    {v.status !== 'active' && (
                      <button type="button" onClick={() => restore(v)} className="font-medium text-accent">Restaurar</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <ExercisePickerSheet
        picker={picker}
        catalog={catalog}
        equipment={equipment}
        onClose={() => setPicker(null)}
        onPick={(id) => {
          if (!picker) return
          setDraft(picker.kind === 'swap' ? swapExercise(days, picker.dayIndex, picker.position, id) : addPlanExercise(days, picker.dayIndex, id))
          setPicker(null)
        }}
      />
    </>
  )
}

function ExerciseRow(props: {
  exercise: PlanExercise
  catalog: Catalog
  weight: number | null
  editing: boolean
  onChange: (patch: Partial<Omit<PlanExercise, 'exerciseId'>>) => void
  onSwap: () => void
  onRemove: () => void
}) {
  const { exercise: e, catalog, editing } = props
  return (
    <li className="py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{catalog.exerciseById.get(e.exerciseId)?.name ?? e.exerciseId}</div>
          <div className="text-sm text-zinc-400 tabular-nums">{formatPlanTarget(e, props.weight)}</div>
          {e.notes && <div className="text-xs text-zinc-500">{e.notes}</div>}
        </div>
        {editing && (
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={props.onSwap} className="h-9 rounded-lg bg-white/5 px-3 text-sm">Cambiar</button>
            <button type="button" onClick={props.onRemove} aria-label="Quitar" className="h-9 rounded-lg bg-white/5 px-3 text-sm text-red-300">✕</button>
          </div>
        )}
      </div>
      {editing && (
        <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-xs">
          <Mini label="Series" value={e.sets} onStep={(d) => props.onChange({ sets: e.sets + d })} />
          <Mini label="Reps mín" value={e.repsMin} onStep={(d) => props.onChange({ repsMin: e.repsMin + d })} />
          <Mini label="Reps máx" value={e.repsMax} onStep={(d) => props.onChange({ repsMax: e.repsMax + d })} />
          <Mini label="RPE" value={e.rpeTarget} onStep={(d) => props.onChange({ rpeTarget: e.rpeTarget + d * 0.5 })} />
        </div>
      )}
    </li>
  )
}

function Mini({ label, value, onStep }: { label: string; value: number; onStep: (d: 1 | -1) => void }) {
  return (
    <div className="rounded-lg bg-white/5 p-1">
      <div className="text-zinc-500">{label}</div>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => onStep(-1)} aria-label={`Restar ${label}`} className="size-8 text-lg">−</button>
        <span className="text-sm font-semibold tabular-nums">{String(value).replace('.', ',')}</span>
        <button type="button" onClick={() => onStep(1)} aria-label={`Sumar ${label}`} className="size-8 text-lg">+</button>
      </div>
    </div>
  )
}

function ExercisePickerSheet(props: { picker: Picker; catalog: Catalog; equipment: string[]; onClose: () => void; onPick: (id: string) => void }) {
  const { picker, catalog } = props
  const [query, setQuery] = useState('')
  const index = useMemo(() => buildExerciseIndex(catalog.exercises, catalog.exerciseMuscles, catalog.muscles), [catalog])
  const options = useMemo(() => {
    if (!picker) return []
    if (picker.kind === 'swap' && !query.trim()) {
      const eq = equivalentExercises(picker.exerciseId, catalog.exercises, catalog.exerciseMuscles, props.equipment)
      return eq.map((e) => index.find((i) => i.id === e.id)!).filter(Boolean)
    }
    return searchExercises(index, query)
  }, [picker, query, index, catalog, props.equipment])

  return (
    <Sheet open={picker !== null} title={picker?.kind === 'swap' ? 'Cambiar por…' : 'Añadir ejercicio'} onClose={props.onClose}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar ejercicio o músculo"
        className="mb-2 h-12 w-full rounded-xl border border-border bg-surface px-4 outline-none focus:border-accent/60"
      />
      {picker?.kind === 'swap' && !query.trim() && <p className="mb-1 text-sm text-zinc-500">Equivalentes (mismos músculos principales, tu material):</p>}
      <ul>
        {options.map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => props.onPick(o.id)} className="flex w-full flex-col items-start border-b border-border/60 py-3 text-left active:bg-white/5">
              <span className="font-medium">{o.name}</span>
              <span className="text-sm text-zinc-500">{o.primaryMuscles.join(', ')}</span>
            </button>
          </li>
        ))}
        {options.length === 0 && <li className="py-8 text-center text-zinc-500">Sin resultados</li>}
      </ul>
    </Sheet>
  )
}

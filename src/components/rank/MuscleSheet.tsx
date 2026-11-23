import { lazy, Suspense, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { MuscleStatus, RankOverview } from '../../domain/progress'
import { chartExerciseOptions, e1rmHistory, emblemState, exercisesForMuscle, lpToNext, muscleContributions } from '../../domain/progress'
import { formatRank } from '../../domain/ranking'
import { formatDecimal } from '../../domain/number'
import { calendarDaysBetween } from '../../domain/dates'
import type { RankingInputs } from '../../db/rankings'
import { getExerciseSets } from '../../db/workouts'
import { RANK_CONFIG } from '../../data/ranking'
import { useHomeUi } from '../../store/homeUi'
import { Sheet } from '../Sheet'
import { Emblem } from './Emblem'

const E1rmChart = lazy(() => import('./E1rmChart'))

export function MuscleSheet({ overview, inputs }: { overview: RankOverview; inputs: RankingInputs }) {
  const { selectedMuscleId, select } = useHomeUi()
  const muscle = overview.muscles.find((m) => m.muscleId === selectedMuscleId)
  return (
    <Sheet open={muscle !== undefined} title={muscle?.name ?? ''} onClose={() => select(undefined)}>
      {muscle && <Body key={muscle.muscleId} muscle={muscle} overview={overview} inputs={inputs} />}
    </Sheet>
  )
}

function Body({ muscle, overview, inputs }: { muscle: MuscleStatus; overview: RankOverview; inputs: RankingInputs }) {
  const contributions = useMemo(() => muscleContributions(muscle.muscleId, overview.exercises, inputs.exerciseMuscles), [muscle.muscleId, overview.exercises, inputs.exerciseMuscles])
  const options = useMemo(
    () => chartExerciseOptions(contributions, exercisesForMuscle(muscle.muscleId, inputs.sets, inputs.exerciseMuscles)),
    [muscle.muscleId, inputs, contributions],
  )
  const [exerciseId, setExerciseId] = useState(options[0])
  // Historial completo del ejercicio bajo demanda (los rangos solo cargan la ventana de 42 días)
  const history = useLiveQuery(
    async () => (exerciseId ? e1rmHistory(await getExerciseSets(exerciseId), exerciseId, { bodyweightKg: inputs.bodyweightKg }) : []),
    [exerciseId, inputs.bodyweightKg],
  )
  const r = muscle.displayed
  const name = (id: string) => inputs.exerciseNames.get(id) ?? id
  const color = r ? (RANK_CONFIG.tiers[r.tierIndex]?.color ?? '#888') : '#525252'
  const days = muscle.lastTrainedAt !== undefined ? calendarDaysBetween(new Date(muscle.lastTrainedAt), new Date(inputs.now)) : undefined

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Emblem tierIndex={r?.tierIndex ?? null} division={r?.division} state={emblemState(muscle)} size={96} />
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-bold">{r ? formatRank(r) : 'Sin rango'}</div>
          {r && (
            <>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/8" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.lp} aria-label="LP">
                <div className="h-full rounded-full" style={{ width: `${r.lp}%`, background: color }} />
              </div>
              <div className="mt-1 flex justify-between text-sm text-neutral-400 tabular-nums">
                <span>{r.lp} LP</span>
                <span>{lpToNext(r)} para subir</span>
              </div>
            </>
          )}
          {muscle.promo?.status === 'promo' && (
            <span className="mt-1 inline-block rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
              Serie de promoción {muscle.promo.wins}-{muscle.promo.losses}
            </span>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Fuerza" value={muscle.strengthScore === null ? '—' : formatDecimal(Math.round(muscle.strengthScore))} />
        <Stat label="Constancia" value={formatDecimal(Math.round(muscle.consistencyScore))} hint={`${formatDecimal(muscle.effectiveSets, 1)} series/7 d`} />
        <Stat label="Último" value={days === undefined ? '—' : days === 0 ? 'Hoy' : `${days} d`} hint={muscle.inactive ? 'inactivo' : undefined} warn={muscle.inactive} />
      </dl>

      <section>
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-neutral-400 uppercase">e1RM en el tiempo</h3>
        {options.length === 0 ? (
          <p className="text-sm text-neutral-500">Aún no has entrenado ejercicios de {muscle.name.toLowerCase()}.</p>
        ) : (
          <>
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {options.map((id) => (
                <button key={id} type="button" aria-pressed={id === exerciseId} onClick={() => setExerciseId(id)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${id === exerciseId ? 'bg-accent/15 text-accent' : 'bg-white/5 text-neutral-400'}`}>
                  {name(id)}
                </button>
              ))}
            </div>
            {history === undefined ? (
              <div className="h-44" />
            ) : history.length === 0 ? (
              <p className="text-sm text-neutral-500">Sin series válidas para calcular el e1RM.</p>
            ) : (
              <Suspense fallback={<div className="h-44" />}>
                <E1rmChart data={history} />
              </Suspense>
            )}
          </>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-neutral-400 uppercase">Ejercicios que más le suman</h3>
        {contributions.length === 0 ? (
          <p className="text-sm text-neutral-500">Ningún ejercicio con estándar de fuerza en los últimos 42 días.</p>
        ) : (
          <ul className="space-y-2">
            {contributions.map((c) => (
              <li key={c.exerciseId} className="rounded-xl border border-border bg-surface px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{name(c.exerciseId)}</span>
                  <span className="shrink-0 text-sm text-neutral-400 tabular-nums">{formatDecimal(Math.round(c.share * 100))} %</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div className="h-full rounded-full" style={{ width: `${c.share * 100}%`, background: color }} />
                </div>
                <div className="mt-1 text-xs text-neutral-500 tabular-nums">
                  {c.factor === 1 ? 'Principal' : 'Secundario'} · score {formatDecimal(Math.round(c.score))} · e1RM {formatDecimal(c.e1rm, 1)} kg
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-2 py-3">
      <dd className={`text-xl font-bold tabular-nums ${warn ? 'text-amber-300' : ''}`}>{value}</dd>
      <dt className="text-xs text-neutral-500">{label}</dt>
      {hint && <div className={`text-[11px] ${warn ? 'text-amber-300' : 'text-neutral-500'}`}>{hint}</div>}
    </div>
  )
}

import { lazy, Suspense, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { weightTrend } from '../domain/energy'
import { rankHistory, weeklyVolumeByMuscle, weightWindow } from '../domain/progress'
import { GLOBAL_RANK_ID } from '../domain/summary'
import { formatDecimal } from '../domain/number'
import { getProgressInputs } from '../db/rankings'
import { PageHeader } from '../components/layout/PageHeader'
import { VolumeHeatmap } from '../components/progress/VolumeHeatmap'
import { DATA_COLORS } from '../components/dataColors'

const BodyweightChart = lazy(() => import('../components/progress/BodyweightChart'))
const RankHistoryChart = lazy(() => import('../components/progress/RankHistoryChart'))

const RANGES = [
  { label: '30 d', days: 30 },
  { label: '90 d', days: 90 },
  { label: '1 año', days: 365 },
  { label: 'Todo', days: Infinity },
]

export default function ProgressPage() {
  const data = useLiveQuery(() => getProgressInputs(Date.now()))
  const [range, setRange] = useState(90)
  const [rankId, setRankId] = useState(GLOBAL_RANK_ID)

  const trend = useMemo(() => (data ? weightWindow(weightTrend(data.weights), data.today, range) : []), [data, range])
  const volume = useMemo(() => (data ? weeklyVolumeByMuscle(data.sets, data.exerciseMuscles, data.today, 8) : null), [data])
  const history = useMemo(() => (data ? rankHistory(data.workouts, rankId) : []), [data, rankId])
  const rankOptions = useMemo(
    () => (data ? [{ id: GLOBAL_RANK_ID, name: 'Global' }, ...data.muscles.filter((m) => rankHistory(data.workouts, m.id).length > 0)] : []),
    [data],
  )

  if (!data || !volume) return null
  const last = trend.at(-1)
  const first = trend[0]

  return (
    <>
      <PageHeader title="Progreso" />
      <div className="space-y-4 px-4">
        <section className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Peso corporal</h2>
            {last && first && (
              <span className="text-sm text-zinc-300 tabular-nums">
                {formatDecimal(last.trendKg, 1)} kg · {last.trendKg - first.trendKg >= 0 ? '+' : '−'}
                {formatDecimal(Math.abs(last.trendKg - first.trendKg), 1)}
              </span>
            )}
          </div>
          <div className="my-2 flex gap-1.5" role="group" aria-label="Rango de fechas">
            {RANGES.map((r) => (
              <button key={r.label} type="button" aria-pressed={range === r.days} onClick={() => setRange(r.days)} className={`rounded-full px-3 py-1 text-sm font-medium ${range === r.days ? 'bg-white/10 text-zinc-100' : 'text-zinc-400'}`}>
                {r.label}
              </button>
            ))}
          </div>
          {trend.length < 2 ? (
            <p className="py-6 text-center text-sm text-zinc-500">Registra tu peso en Inicio para ver la evolución.</p>
          ) : (
            <>
              <div className="mb-1 flex gap-4 text-xs text-zinc-400">
                <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-full" style={{ background: DATA_COLORS.rawWeight }} />Peso registrado</span>
                <span className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded" style={{ background: DATA_COLORS.trend }} />Tendencia</span>
              </div>
              <Suspense fallback={<div className="h-52" />}>
                <BodyweightChart data={trend} />
              </Suspense>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-lg font-semibold">Volumen semanal por músculo</h2>
          <VolumeHeatmap weekStarts={volume.weekStarts} rows={data.muscles.map((m) => ({ id: m.id, name: m.name, values: volume.byMuscle.get(m.id) ?? volume.weekStarts.map(() => 0) }))} />
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="text-lg font-semibold">Historial de rangos</h2>
          <div className="my-2 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Rango a mostrar">
            {rankOptions.map((o) => (
              <button key={o.id} type="button" aria-pressed={rankId === o.id} onClick={() => setRankId(o.id)} className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${rankId === o.id ? 'bg-accent/15 text-accent' : 'bg-white/5 text-zinc-400'}`}>
                {o.name}
              </button>
            ))}
          </div>
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">Termina entrenos para ver cómo evoluciona tu rango.</p>
          ) : (
            <Suspense fallback={<div className="h-52" />}>
              <RankHistoryChart data={history} />
            </Suspense>
          )}
        </section>
      </div>
    </>
  )
}

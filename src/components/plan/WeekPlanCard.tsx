import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import { DAY_NAMES } from '../../domain/plan'
import { weekdayIndex } from '../../domain/dates'
import { getWeekStatus, saveWeekFeedback } from '../../db/plans'
import { getCatalog, startWorkout } from '../../db/workouts'
import { usePlanUi } from '../../store/planUi'
import { useTrainUi } from '../../store/trainUi'
import { currentWeekStart, todayKey } from './weekDates'
import { WeekRating } from './WeekRating'

/** Tarjeta "Rutina de esta semana": ofrece generarla, muestra el día que toca y pide la valoración del domingo. */
export function WeekPlanCard({ variant }: { variant: 'home' | 'train' }) {
  const weekStart = currentWeekStart()
  const today = todayKey()
  const status = useLiveQuery(() => getWeekStatus(weekStart, today), [weekStart, today])
  const catalog = useLiveQuery(() => getCatalog())
  const openGenerator = usePlanUi((s) => s.openGenerator)
  const expand = useTrainUi((s) => s.expand)
  const navigate = useNavigate()
  if (!status || !catalog) return <div aria-hidden className="h-32 animate-pulse rounded-2xl border border-border bg-surface" />

  const { plan, done, next, rateWeek } = status

  if (!plan) {
    return (
      <section className="rounded-2xl border border-accent/40 bg-accent/[0.06] p-4">
        <h2 className="text-lg font-semibold">Rutina de esta semana</h2>
        <p className="mt-1 text-sm text-zinc-300">Aún no tienes rutina para esta semana. La IA la diseña con tus rangos, tu eslabón débil y cómo te fue la semana pasada.</p>
        <button type="button" onClick={openGenerator} className="mt-3 h-12 w-full rounded-xl bg-accent font-bold text-bg active:scale-[0.98]">
          Generar con IA
        </button>
      </section>
    )
  }

  async function start() {
    if (!plan || !next) return
    expand(undefined)
    await startWorkout(Date.now(), undefined, undefined, { planId: plan.id, dayIndex: next.dayIndex })
    if (variant === 'home') navigate('/entrenar')
  }

  const todayIdx = weekdayIndex(today)
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Rutina de esta semana</h2>
        <Link to="/entrenar/plan" className="text-sm font-medium text-accent">
          Ver rutina
        </Link>
      </div>
      <ol className="mt-3 flex gap-1.5" aria-label="Días de la semana">
        {DAY_NAMES.map((name, i) => {
          const day = plan.days.find((d) => d.dayIndex === i)
          const isDone = done.has(i)
          return (
            <li
              key={name}
              title={day ? `${name}: ${day.name}${isDone ? ' (hecho)' : ''}` : `${name}: descanso`}
              className={`flex h-10 flex-1 flex-col items-center justify-center rounded-lg text-[11px] font-semibold ${
                !day ? 'text-zinc-600' : isDone ? 'bg-emerald-500/15 text-emerald-300' : next?.dayIndex === i ? 'bg-accent/20 text-accent' : 'bg-white/5 text-zinc-300'
              } ${i === todayIdx ? 'ring-1 ring-zinc-500' : ''}`}
            >
              <span>{name.slice(0, 2)}</span>
              <span aria-hidden>{!day ? '·' : isDone ? '✓' : '●'}</span>
            </li>
          )
        })}
      </ol>

      {next ? (
        <div className="mt-3">
          <p className="text-sm text-zinc-400">{next.dayIndex === todayIdx ? 'Hoy toca' : next.dayIndex < todayIdx ? 'Pendiente' : 'Próximo'}: <span className="font-semibold text-zinc-100">{DAY_NAMES[next.dayIndex]} · {next.name}</span></p>
          <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{next.exercises.map((e) => catalog.exerciseById.get(e.exerciseId)?.name ?? e.exerciseId).join(' · ')}</p>
          <button type="button" onClick={start} className="mt-3 h-14 w-full rounded-2xl bg-accent text-lg font-bold text-bg active:scale-[0.98]">
            Empezar {next.name}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm font-medium text-emerald-300">¡Semana completada! 💪</p>
      )}

      {rateWeek && (
        <div className="mt-4 border-t border-border/60 pt-4">
          <WeekRating title="¿Cómo fue la semana?" onRate={(r) => saveWeekFeedback(rateWeek, r, Date.now())} />
        </div>
      )}
    </section>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { PageHeader } from '../layout/PageHeader'
import { deleteRoutine, getCatalog, getLastFinishedWorkout, listRoutines, startWorkout } from '../../db/workouts'
import { useTrainUi } from '../../store/trainUi'
import { WeekPlanCard } from '../plan/WeekPlanCard'

export function StartWorkout() {
  const routines = useLiveQuery(() => listRoutines())
  const catalog = useLiveQuery(() => getCatalog())
  const last = useLiveQuery(async () => ({ workout: await getLastFinishedWorkout() }))
  const expand = useTrainUi((s) => s.expand)

  function start(routineId?: string) {
    expand(undefined) // el nuevo entreno empieza con su primer ejercicio desplegado
    void startWorkout(Date.now(), routineId)
  }

  async function remove(id: string, name: string) {
    if (window.confirm(`¿Borrar la rutina "${name}"?`)) await deleteRoutine(id)
  }

  return (
    <>
      <PageHeader title="Entrenar" />
      <div className="space-y-6 px-4">
        <WeekPlanCard variant="train" />
        <button type="button" onClick={() => start()} className="h-12 w-full rounded-2xl border border-border font-semibold active:bg-white/5">
          Entreno libre (vacío)
        </button>

        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-zinc-400 uppercase">Rutinas</h2>
          {routines && routines.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-zinc-500">
              Aún no tienes rutinas. Al terminar un entreno puedes guardarlo como rutina.
            </p>
          )}
          <ul className="space-y-3">
            {routines?.map(({ routine, exercises }) => (
              <li key={routine.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-semibold">{routine.name}</h3>
                    <p className="line-clamp-2 text-sm text-zinc-500">
                      {exercises.map((re) => catalog?.exerciseById.get(re.exerciseId)?.name ?? re.exerciseId).join(' · ')}
                    </p>
                  </div>
                  <button type="button" onClick={() => remove(routine.id, routine.name)} aria-label={`Borrar ${routine.name}`} className="-mr-2 -mt-1 p-2 text-zinc-600 active:text-red-300">
                    ✕
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => start(routine.id)}
                  className="mt-3 h-12 w-full rounded-xl border border-accent/50 font-semibold text-accent active:bg-accent/10"
                >
                  Empezar
                </button>
              </li>
            ))}
          </ul>
        </section>

        {last?.workout?.summary && (
          <Link to={`/entrenar/resumen/${last.workout.id}`} className="block py-2 text-center text-sm text-zinc-400 underline-offset-4 active:underline">
            Ver resumen del último entreno
          </Link>
        )}
      </div>
    </>
  )
}

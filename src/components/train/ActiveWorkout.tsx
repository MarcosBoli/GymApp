import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import type { Workout } from '../../domain/types'
import { formatClock } from '../../domain/restTimer'
import { formatRoutineTarget } from '../../domain/workout'
import { DAY_NAMES, formatPlanTarget, suggestWeight } from '../../domain/plan'
import { getRecentE1RMs } from '../../db/planGeneration'
import { db } from '../../db/db'
import { discardWorkout, finishWorkout, getBodyweightAt, getCatalog, getRoutineExercises, getWorkoutSets } from '../../db/workouts'
import { useTrainUi } from '../../store/trainUi'
import { useRestTimer } from '../../store/restTimer'
import { useNow } from '../hooks/useNow'
import { ExerciseCard } from './ExerciseCard'
import { ExercisePicker } from './ExercisePicker'

export function ActiveWorkout({ workout }: { workout: Workout }) {
  const navigate = useNavigate()
  const sets = useLiveQuery(() => getWorkoutSets(workout.id), [workout.id])
  const catalog = useLiveQuery(() => getCatalog())
  const routine = useLiveQuery(
    async () =>
      workout.routineId
        ? { name: (await db.routines.get(workout.routineId))?.name, exercises: await getRoutineExercises(workout.routineId) }
        : { name: undefined, exercises: [] },
    [workout.routineId],
  )
  // Día del plan semanal (si el entreno sale de ahí) + pesos sugeridos por la app
  const planned = useLiveQuery(async () => {
    if (!workout.planId) return { day: undefined, weights: new Map<string, number | null>() }
    const plan = await db.weeklyPlans.get(workout.planId)
    const day = plan?.days.find((d) => d.dayIndex === workout.planDayIndex)
    const bw = await getBodyweightAt(Date.now())
    const e1rms = await getRecentE1RMs(day?.exercises.map((e) => e.exerciseId) ?? [], Date.now(), bw)
    const exercises = await db.exercises.bulkGet(day?.exercises.map((e) => e.exerciseId) ?? [])
    const weights = new Map(
      (day?.exercises ?? []).map((e, i) => [e.exerciseId, suggestWeight(e1rms.get(e.exerciseId), e, exercises[i]?.equipment ?? 'other', bw)] as const),
    )
    return { day, weights }
  }, [workout.planId, workout.planDayIndex])
  const { expandedExerciseId, openPicker } = useTrainUi()
  const stopRest = useRestTimer((s) => s.stop)
  const now = useNow(1000)

  if (!sets || !catalog || !routine || !planned) return null

  // Sin selección → el primero. Con selección que aún no está en la lista (recién añadido, la
  // consulta en vivo llega un instante después) no se despliega otro para no robar el foco.
  const expanded = expandedExerciseId ?? workout.exerciseIds[0]
  const hasWorkingSets = sets.some((s) => !s.isWarmup)

  async function finish() {
    if (!hasWorkingSets) {
      if (window.confirm('No has registrado ninguna serie. ¿Descartar el entreno?')) {
        stopRest()
        await discardWorkout(workout.id)
      }
      return
    }
    if (!window.confirm('¿Terminar el entreno?')) return
    stopRest()
    await finishWorkout(workout.id, Date.now())
    navigate(`/entrenar/resumen/${workout.id}`)
  }

  async function discard() {
    if (!window.confirm('Se borrarán el entreno y todas sus series. ¿Descartar?')) return
    stopRest()
    await discardWorkout(workout.id)
  }

  return (
    <>
      <header className="sticky top-0 z-20 -mt-[env(safe-area-inset-top)] flex items-center gap-3 border-b border-border bg-bg/90 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 backdrop-blur-xl">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{planned.day ? `${DAY_NAMES[planned.day.dayIndex]} · ${planned.day.name}` : (routine.name ?? 'Entreno libre')}</h1>
          <p className="text-sm tabular-nums text-neutral-400">{formatClock(now - workout.startedAt)}</p>
        </div>
        <button type="button" onClick={finish} className="h-11 rounded-xl bg-accent px-5 font-bold text-bg active:scale-[0.98]">
          Terminar
        </button>
      </header>

      <div className="space-y-3 px-4 pt-4">
        {workout.exerciseIds.length === 0 && (
          <p className="px-2 pt-6 pb-2 text-center text-neutral-400">
            Añade tu primer ejercicio. Cada serie se guarda al momento, así que puedes cerrar la app sin perder nada.
          </p>
        )}
        {workout.exerciseIds.map((id) => {
          const exercise = catalog.exerciseById.get(id)
          if (!exercise) return null
          const target = routine.exercises.find((re) => re.exerciseId === id)
          const planEx = planned.day?.exercises.find((e) => e.exerciseId === id)
          const planWeight = planned.weights.get(id) ?? null
          return (
            <ExerciseCard
              key={id}
              workoutId={workout.id}
              exercise={exercise}
              muscles={catalog.musclesByExercise.get(id)}
              sets={sets.filter((s) => s.exerciseId === id)}
              expanded={expanded === id}
              target={planEx ? formatPlanTarget(planEx, planWeight) : target ? formatRoutineTarget(target) : ''}
              planned={planEx ? { weightKg: planWeight, repsMin: planEx.repsMin, repsMax: planEx.repsMax } : undefined}
              notes={planEx?.notes}
            />
          )
        })}

        <button
          type="button"
          onClick={openPicker}
          className="h-14 w-full rounded-2xl border border-dashed border-accent/50 text-lg font-semibold text-accent active:bg-accent/10"
        >
          + Añadir ejercicio
        </button>

        <button type="button" onClick={discard} className="w-full py-4 text-sm text-neutral-500 active:text-red-300">
          Descartar entreno
        </button>
        {/* hueco para la barra de descanso */}
        <div className="h-20" />
      </div>

      <ExercisePicker workoutId={workout.id} catalog={catalog} selectedIds={workout.exerciseIds} />
    </>
  )
}

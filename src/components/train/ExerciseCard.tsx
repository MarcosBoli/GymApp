import { useLiveQuery } from 'dexie-react-hooks'
import type { Exercise, WorkoutSet } from '../../domain/types'
import { formatSetsLine, setLabels, suggestPlannedSet } from '../../domain/workout'
import { formatDecimal } from '../../domain/number'
import { addSet, deleteSet, getLastSessionSets, removeExerciseFromWorkout } from '../../db/workouts'
import { useRestTimer } from '../../store/restTimer'
import { useTrainUi } from '../../store/trainUi'
import { useCoachChatUi } from '../../store/coachChatUi'
import { unlockAudio } from '../../lib/sound'
import { SetInput } from './SetInput'

interface Props {
  workoutId: string
  exercise: Exercise
  sets: WorkoutSet[]
  expanded: boolean
  target: string
  /** Del plan semanal: peso calculado por la app y rango de reps (primera serie del día). */
  planned?: { weightKg: number | null; repsMin: number; repsMax: number }
  notes?: string
}

export function ExerciseCard({ workoutId, exercise, sets, expanded, target, planned, notes }: Props) {
  const last = useLiveQuery(async () => ({ sets: await getLastSessionSets(exercise.id, workoutId) }), [exercise.id, workoutId])
  const startRest = useRestTimer((s) => s.start)
  const expand = useTrainUi((s) => s.expand)
  const openChat = useCoachChatUi((s) => s.openChat)
  const bodyweight = exercise.equipment === 'bodyweight'
  const labels = setLabels(sets)
  const workingCount = labels.filter((l) => l !== 'C').length

  async function save(values: { weightKg: number; reps: number; rpe?: number; isWarmup: boolean }) {
    unlockAudio() // dentro del toque: iOS permite sonar luego al terminar el descanso
    const now = Date.now()
    await addSet(workoutId, exercise.id, values, now)
    if (!values.isWarmup) startRest(now)
  }

  async function remove() {
    if (sets.length && !window.confirm(`¿Quitar ${exercise.name} y sus ${sets.length} series?`)) return
    await removeExerciseFromWorkout(workoutId, exercise.id)
  }

  return (
    <section className={`rounded-2xl border bg-surface p-4 transition-colors ${expanded ? 'border-accent/40' : 'border-border'}`}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => expand(exercise.id)} className="min-w-0 flex-1 text-left">
          <h2 className="truncate text-lg font-semibold">{exercise.name}</h2>
          <p className="text-sm text-neutral-500">
            {workingCount} {workingCount === 1 ? 'serie' : 'series'}
            {target && <span> · objetivo {target}</span>}
          </p>
          {notes && <p className="text-xs text-neutral-500">{notes}</p>}
        </button>
        <button
          type="button"
          onClick={() => openChat(exercise.id)}
          aria-label={`Preguntar al coach sobre ${exercise.name}`}
          className="h-8 shrink-0 rounded-full bg-accent/15 px-3 text-sm font-semibold text-accent"
        >
          Preguntar
        </button>
        <button type="button" onClick={remove} aria-label={`Quitar ${exercise.name}`} className="-mr-2 -mt-1 p-2 text-neutral-500 active:text-red-300">
          ✕
        </button>
      </div>

      {sets.length > 0 && (
        <ol className="mt-3 space-y-1.5">
          {sets.map((s, i) => (
            <li key={s.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-base tabular-nums">
              <span className={`w-6 text-sm font-semibold ${s.isWarmup ? 'text-amber-300' : 'text-neutral-500'}`}>
                {labels[i]}
              </span>
              <span className="flex-1 font-medium">
                {formatDecimal(s.weightKg)} kg × {s.reps}
                {s.rpe !== undefined && <span className="ml-2 text-sm text-neutral-500">RPE {formatDecimal(s.rpe)}</span>}
              </span>
              <button type="button" onClick={() => deleteSet(s.id)} aria-label="Borrar serie" className="p-1 text-neutral-600 active:text-red-300">
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}

      {expanded && last && (
        <>
          {last.sets.length > 0 && (
            <p className="mt-3 text-sm text-neutral-500">
              Última vez: <span className="text-neutral-300">{formatSetsLine(last.sets)}</span>
            </p>
          )}
          <SetInput
            key={sets.length}
            setNumber={workingCount + 1}
            suggestion={suggestPlannedSet(planned, last.sets, sets)}
            bodyweight={bodyweight}
            onSave={save}
          />
        </>
      )}
    </section>
  )
}

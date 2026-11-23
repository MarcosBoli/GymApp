import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { buildExerciseIndex, searchExercises } from '../../domain/workout'
import { addExerciseToWorkout, type Catalog } from '../../db/workouts'
import { useTrainUi } from '../../store/trainUi'

export function ExercisePicker({ workoutId, catalog, selectedIds }: { workoutId: string; catalog: Catalog; selectedIds: string[] }) {
  const { pickerOpen, closePicker, expand } = useTrainUi()
  const [query, setQuery] = useState('')
  const index = useMemo(() => buildExerciseIndex(catalog.exercises, catalog.exerciseMuscles, catalog.muscles), [catalog])
  const results = useMemo(() => searchExercises(index, query), [index, query])

  async function pick(exerciseId: string) {
    // Seleccionar antes de escribir: así ninguna otra tarjeta queda desplegada mientras tanto
    expand(exerciseId)
    setQuery('')
    closePicker()
    await addExerciseToWorkout(workoutId, exerciseId)
  }

  // Portal: el contenedor de página tiene transform (animación) y rompería position: fixed
  return createPortal(
    <AnimatePresence>
      {pickerOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col bg-bg pt-safe pl-safe pr-safe"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 400, damping: 40 }}
          role="dialog"
          aria-label="Añadir ejercicio"
        >
          <div className="mx-auto flex w-full max-w-lg items-center gap-3 px-4 pt-3 pb-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar ejercicio o músculo"
              autoFocus
              className="h-12 flex-1 rounded-xl border border-border bg-surface px-4 outline-none focus:border-accent/60"
            />
            <button type="button" onClick={closePicker} className="px-1 font-medium text-accent">
              Cerrar
            </button>
          </div>
          <ul className="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-4 pb-safe">
            {results.map((item) => {
              const added = selectedIds.includes(item.id)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={added}
                    onClick={() => pick(item.id)}
                    className="flex w-full items-center justify-between border-b border-border/60 py-3.5 text-left active:bg-white/5 disabled:opacity-40"
                  >
                    <span>
                      <span className="block font-medium">{item.name}</span>
                      <span className="block text-sm text-neutral-500">{item.primaryMuscles.join(', ')}</span>
                    </span>
                    <span className="text-xl text-accent">{added ? '✓' : '+'}</span>
                  </button>
                </li>
              )
            })}
            {results.length === 0 && <li className="py-10 text-center text-neutral-500">Sin resultados</li>}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

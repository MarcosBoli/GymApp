import type { MuscleStatus } from '../../domain/progress'
import { formatRank } from '../../domain/ranking'
import { useHomeUi } from '../../store/homeUi'
import { Emblem } from '../rank/Emblem'

/** Lista de músculos (alternativa accesible al mapa: el rango no depende solo del color). */
export function MuscleList({ muscles }: { muscles: MuscleStatus[] }) {
  const select = useHomeUi((s) => s.select)
  return (
    <ul className="grid grid-cols-2 gap-2">
      {muscles.map((m) => (
        <li key={m.muscleId}>
          <button type="button" onClick={() => select(m.muscleId)} className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-2 py-2 text-left active:bg-white/5">
            <Emblem tierIndex={m.displayed?.tierIndex ?? null} size={32} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{m.name}</span>
              <span className={`block truncate text-xs ${m.inactive ? 'text-amber-300' : 'text-zinc-500'}`}>
                {m.displayed ? formatRank(m.displayed) : 'Sin rango'}
                {m.inactive ? ' · inactivo' : ''}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

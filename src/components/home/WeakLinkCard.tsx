import type { MuscleStatus } from '../../domain/progress'
import { lpToNext } from '../../domain/progress'
import { formatRank } from '../../domain/ranking'
import { useHomeUi } from '../../store/homeUi'
import { Emblem } from '../rank/Emblem'

/** El músculo con menor score: lo que más tira hacia abajo del rango global. */
export function WeakLinkCard({ weak, inactive }: { weak: MuscleStatus | null; inactive: MuscleStatus[] }) {
  const select = useHomeUi((s) => s.select)
  if (!weak?.displayed) return null
  return (
    <section className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.04] p-4">
      <button type="button" onClick={() => select(weak.muscleId)} className="flex w-full items-center gap-3 text-left">
        <Emblem tierIndex={weak.displayed.tierIndex} division={weak.displayed.division} size={52} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold tracking-wide text-amber-300 uppercase">Eslabón débil</div>
          <div className="text-lg font-semibold">{weak.name}</div>
          <div className="text-sm text-zinc-400">
            {formatRank(weak.displayed)} · le faltan {lpToNext(weak.displayed)} LP para subir
          </div>
        </div>
        <span aria-hidden className="text-xl text-zinc-500">›</span>
      </button>
      {inactive.length > 0 && (
        <p className="mt-3 border-t border-border/60 pt-3 text-sm text-zinc-400">
          <span className="font-medium text-amber-300">Inactivos +14 días: </span>
          {inactive.map((m) => m.name).join(', ')}
        </p>
      )}
    </section>
  )
}

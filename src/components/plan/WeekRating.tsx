import type { WeekRating as Rating } from '../../domain/planSchema'
import { RATING_LABELS } from '../../domain/plan'

/** "¿Cómo fue la semana? Dura / Bien / Fácil" */
export function WeekRating({ title, onRate, onSkip }: { title: string; onRate: (r: Rating) => void; onSkip?: () => void }) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(['hard', 'ok', 'easy'] as const).map((r) => (
          <button key={r} type="button" onClick={() => onRate(r)} className="h-12 rounded-xl border border-border font-semibold active:bg-white/5">
            {RATING_LABELS[r]}
          </button>
        ))}
      </div>
      {onSkip && (
        <button type="button" onClick={onSkip} className="mt-2 w-full py-2 text-sm text-neutral-500">
          Omitir
        </button>
      )}
    </div>
  )
}

import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { BODY_BASE, BODY_MUSCLES, mirrorPoints, type BodyView } from '../../data/bodyMap'
import type { MuscleStatus } from '../../domain/progress'
import { formatRank } from '../../domain/ranking'
import { RANK_CONFIG } from '../../data/ranking'
import { useHomeUi } from '../../store/homeUi'

const UNRANKED = '#2e2828'
const SWIPE_PX = 50

const fill = (m?: MuscleStatus) => (m?.displayed ? (RANK_CONFIG.tiers[m.displayed.tierIndex]?.color ?? UNRANKED) : UNRANKED)
const both = (points: string, center?: boolean) => (center ? [points] : [points, mirrorPoints(points)])

/** Silueta delantera/trasera; swipe horizontal o los botones para girarla. Cada músculo es tocable. */
export function BodyMap({ muscles }: { muscles: MuscleStatus[] }) {
  const { view, setView, select } = useHomeUi()
  const byId = new Map(muscles.map((m) => [m.muscleId, m]))
  const flip = () => setView(view === 'front' ? 'back' : 'front')

  function onDragEnd(_: unknown, info: PanInfo) {
    if (Math.abs(info.offset.x) > SWIPE_PX) flip()
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tu cuerpo</h2>
        <div className="flex rounded-lg bg-white/5 p-0.5 text-sm" role="group" aria-label="Vista">
          {(['front', 'back'] as BodyView[]).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 font-medium ${view === v ? 'bg-white/10 text-neutral-100' : 'text-neutral-400'}`}>
              {v === 'front' ? 'Delante' : 'Detrás'}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mx-auto h-[380px] w-[200px] touch-pan-y overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.svg
            key={view}
            viewBox="0 0 200 380"
            className="absolute inset-0 h-full w-full cursor-grab"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.4}
            onDragEnd={onDragEnd}
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90, opacity: 0 }}
            transition={{ duration: 0.25 }}
            aria-label={view === 'front' ? 'Vista delantera' : 'Vista trasera'}
          >
            {BODY_BASE.flatMap((s, i) => both(s.points, s.center).map((p, j) => <polygon key={`b${i}-${j}`} points={p} fill="#1f1f27" stroke="#2a2a33" strokeWidth="1" />))}
            {BODY_MUSCLES[view].map(({ muscleId, shapes }) => {
              const m = byId.get(muscleId)
              const label = `${m?.name ?? muscleId}: ${m?.displayed ? formatRank(m.displayed) : 'sin rango'}${m?.inactive ? ', inactivo' : ''}`
              return (
                <g
                  key={muscleId}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  onClick={() => select(muscleId)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && select(muscleId)}
                  className="cursor-pointer outline-none [&:focus-visible>polygon]:stroke-white"
                >
                  {shapes.flatMap((s, i) =>
                    both(s.points).map((p, j) => (
                      <polygon
                        key={`${i}-${j}`}
                        points={p}
                        fill={fill(m)}
                        fillOpacity={m?.inactive ? 0.45 : 1}
                        stroke="#0b0909"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                        strokeDasharray={m?.inactive ? '3 2' : undefined}
                      />
                    )),
                  )}
                </g>
              )
            })}
          </motion.svg>
        </AnimatePresence>
      </div>
      <p className="mt-1 text-center text-xs text-neutral-500">Desliza para girar · toca un músculo para ver su ficha</p>
    </section>
  )
}

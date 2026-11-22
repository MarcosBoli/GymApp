import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router'
import { motion } from 'framer-motion'
import type { RankDiff } from '../domain/ranking'
import { GLOBAL_RANK_ID, type PromotionEvent } from '../domain/summary'
import { formatClock } from '../domain/restTimer'
import { formatDecimal } from '../domain/number'
import { db } from '../db/db'
import { getCatalog, saveWorkoutAsRoutine } from '../db/workouts'
import { TierBadge, tierColor } from '../components/rank/TierBadge'
import { LpDelta } from '../components/rank/LpDelta'

const PROMO_TEXT: Record<PromotionEvent['kind'], string> = {
  started: '¡Serie de promoción!',
  won_game: 'Promo: victoria',
  lost_game: 'Promo: derrota',
  promoted: '¡Promo superada!',
  failed: 'Promo fallida',
  demoted: 'Descenso',
}

const dateFormat = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export default function WorkoutSummaryPage() {
  const { workoutId = '' } = useParams()
  const navigate = useNavigate()
  const workout = useLiveQuery(async () => ({ w: await db.workouts.get(workoutId) }), [workoutId])
  const catalog = useLiveQuery(() => getCatalog())

  if (!workout || !catalog) return null
  const w = workout.w
  if (!w?.summary) {
    return (
      <div className="px-4 pt-10 text-center text-zinc-400">
        Resumen no disponible. <Link to="/entrenar" className="text-accent">Volver</Link>
      </div>
    )
  }
  const s = w.summary
  const globalDiff = s.diffs.find((d) => d.id === GLOBAL_RANK_ID)
  const muscleDiffs = s.diffs.filter((d) => d.id !== GLOBAL_RANK_ID)
  const promoted = muscleDiffs.filter((d) => d.change === 'promoted')
  const promoById = new Map(s.promotions.map((p) => [p.id, p]))
  const muscleName = (id: string) => catalog.muscleById.get(id)?.name ?? id

  async function saveRoutine() {
    const name = window.prompt('Nombre de la rutina', 'Mi rutina')
    if (name?.trim()) await saveWorkoutAsRoutine(workoutId, name, Date.now())
  }

  return (
    <div className="space-y-5 px-4 pt-4">
      <header>
        <motion.p initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-semibold tracking-[0.2em] text-accent uppercase">
          Resumen de partida
        </motion.p>
        <p className="text-sm text-zinc-500 first-letter:uppercase">{dateFormat.format(w.startedAt)}</p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Duración" value={formatClock(s.durationMs)} />
        <Stat label="Series" value={String(s.workingSets)} />
        <Stat label="Volumen" value={`${formatDecimal(Math.round(s.volumeKg))} kg`} />
      </div>

      {!s.ranked && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200">
          Completa tu sexo y peso en <Link to="/perfil" className="font-semibold underline">Perfil</Link> para ganar LP y ver tus rangos.
        </div>
      )}

      {promoted.map((d, i) => (
        <PromotionBanner key={d.id} diff={d} name={muscleName(d.id)} delay={0.3 + i * 0.25} />
      ))}

      {globalDiff?.after && (
        <motion.section
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-border bg-surface p-4"
          style={{ boxShadow: `0 0 40px -12px ${tierColor(globalDiff.after)}` }}
        >
          <div className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Rango global</div>
          <div className="mt-2 flex items-center justify-between">
            <TierBadge rank={globalDiff.after} size="lg" showLp />
            {globalDiff.change !== 'new' && <LpDelta value={globalDiff.lpDelta} className="text-xl" />}
          </div>
          {promoById.get(GLOBAL_RANK_ID) && <PromoChip event={promoById.get(GLOBAL_RANK_ID)!} />}
        </motion.section>
      )}

      {muscleDiffs.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-zinc-400 uppercase">LP por músculo</h2>
          <ul className="space-y-2">
            {muscleDiffs.map((d, i) => (
              <motion.li
                key={d.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.07 }}
                className="rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{muscleName(d.id)}</div>
                    {d.after && <TierBadge rank={d.after} size="sm" showLp />}
                  </div>
                  {d.change === 'new' ? (
                    <span className="text-sm font-semibold text-accent">¡Nuevo rango!</span>
                  ) : (
                    <LpDelta value={d.lpDelta} delay={0.15 + i * 0.07} />
                  )}
                </div>
                {promoById.get(d.id) && <PromoChip event={promoById.get(d.id)!} />}
              </motion.li>
            ))}
          </ul>
        </section>
      )}

      {s.records.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-zinc-400 uppercase">Récords personales</h2>
          <ul className="space-y-2">
            {s.records.map((r, i) => (
              <motion.li
                key={r.exerciseId}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 + i * 0.1, type: 'spring' }}
                className="flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3"
              >
                <span className="text-2xl" aria-hidden>🏆</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{catalog.exerciseById.get(r.exerciseId)?.name ?? r.exerciseId}</div>
                  <div className="text-sm text-zinc-400">
                    {formatDecimal(r.weightKg)} kg × {r.reps} · e1RM {formatDecimal(r.e1rm, 1)} kg
                    <span className="text-emerald-300"> (+{formatDecimal(r.e1rm - r.previousBest, 1)})</span>
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-2 pb-4">
        {!w.routineId && w.exerciseIds.length > 0 && (
          <button type="button" onClick={saveRoutine} className="h-12 w-full rounded-xl border border-border font-semibold active:bg-white/5">
            Guardar como rutina
          </button>
        )}
        <button type="button" onClick={() => navigate('/entrenar')} className="h-14 w-full rounded-2xl bg-accent text-lg font-bold text-bg active:scale-[0.98]">
          Continuar
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-3 text-center">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  )
}

function PromoChip({ event }: { event: PromotionEvent }) {
  const record = event.state.status === 'promo' ? ` (${event.state.wins}-${event.state.losses})` : ''
  const good = event.kind === 'started' || event.kind === 'won_game' || event.kind === 'promoted'
  return (
    <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${good ? 'bg-accent/15 text-accent' : 'bg-red-500/10 text-red-300'}`}>
      {PROMO_TEXT[event.kind]}
      {record}
    </span>
  )
}

function PromotionBanner({ diff, name, delay }: { diff: RankDiff; name: string; delay: number }) {
  if (!diff.after) return null
  const color = tierColor(diff.after)
  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.6, rotate: -4 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 14 }}
      className="relative overflow-hidden rounded-2xl border p-5 text-center"
      style={{ borderColor: color, background: `radial-gradient(circle at 50% 0%, ${color}33, transparent 70%)` }}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0"
        style={{ background: `linear-gradient(110deg, transparent 30%, ${color}40 50%, transparent 70%)` }}
        initial={{ x: '-100%' }}
        animate={{ x: '100%' }}
        transition={{ delay: delay + 0.3, duration: 1.2, ease: 'easeInOut' }}
      />
      <div className="relative">
        <div className="text-sm font-semibold tracking-[0.2em] uppercase" style={{ color }}>
          ¡Ascenso!
        </div>
        <div className="mt-1 text-lg font-semibold">{name}</div>
        <div className="mt-2 flex justify-center">
          <TierBadge rank={diff.after} size="lg" />
        </div>
      </div>
    </motion.section>
  )
}

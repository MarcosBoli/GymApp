import { motion } from 'framer-motion'
import { emblemState, type RankOverview } from '../../domain/progress'
import { formatRank } from '../../domain/ranking'
import { RANK_CONFIG } from '../../data/ranking'
import { Emblem } from '../rank/Emblem'
import { Ring } from './Ring'

/** Emblema del rango global dentro de un anillo de LP. */
export function GlobalRankHeader({ global }: { global: RankOverview['global'] }) {
  const r = global.displayed
  if (!r) {
    return (
      <section className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4">
        <Emblem tierIndex={null} size={72} />
        <div>
          <div className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Rango global</div>
          <div className="text-lg font-semibold">Sin clasificar</div>
          <p className="text-sm text-zinc-500">Termina un entreno (con sexo y peso en Perfil) para recibir tu rango.</p>
        </div>
      </section>
    )
  }
  const color = RANK_CONFIG.tiers[r.tierIndex]?.color ?? '#888'
  const inPromo = global.promo?.status === 'promo'
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4"
      style={{ boxShadow: `0 0 48px -16px ${color}` }}
    >
      <Ring fraction={r.lp / 100} color={color} size={112} stroke={6}>
        <Emblem tierIndex={r.tierIndex} division={r.division} state={emblemState(global)} size={84} />
      </Ring>
      <div className="min-w-0">
        <div className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Rango global</div>
        <div className="text-2xl font-bold">{formatRank(r)}</div>
        <div className="text-sm text-zinc-300 tabular-nums">{r.lp} LP</div>
        {inPromo && global.promo?.status === 'promo' && (
          <span className="mt-1 inline-block rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
            Serie de promoción {global.promo.wins}-{global.promo.losses}
          </span>
        )}
        <div className="mt-1 text-xs text-zinc-500">{global.trainedMuscles} músculos clasificados</div>
      </div>
    </motion.section>
  )
}

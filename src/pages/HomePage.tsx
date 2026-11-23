import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { adaptiveStatusText, energyOverview, progressOf, type AdaptiveTdee } from '../domain/energy'
import { toDateKey } from '../domain/dates'
import { formatDecimal } from '../domain/number'
import { db } from '../db/db'
import { getEnergyInputs } from '../db/food'
import { PageHeader } from '../components/layout/PageHeader'
import { Ring } from '../components/home/Ring'
import { WeeklyBalanceChart } from '../components/home/WeeklyBalanceChart'
import { WeightQuickLog } from '../components/home/WeightQuickLog'
import { MACROS } from '../components/food/MacroLegend'
import { DATA_COLORS } from '../components/dataColors'

const fmt = (n: number) => formatDecimal(Math.round(n))
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`

export default function HomePage() {
  const today = toDateKey(new Date())
  const overview = useLiveQuery(async () => energyOverview(await getEnergyInputs(today)), [today])
  const todayWeight = useLiveQuery(async () => ({ kg: (await db.bodyweightLogs.get(today))?.weightKg }), [today])

  if (!overview || !todayWeight) return null

  return (
    <>
      <PageHeader title="Inicio" />
      <div className="space-y-4 px-4">
        {!overview.ready ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200">
            {overview.missing === 'profile' ? 'Completa tu perfil' : 'Registra tu peso'} para calcular tu gasto y tus objetivos.{' '}
            <Link to="/perfil" className="font-semibold underline">Ir a Perfil</Link>
          </div>
        ) : (
          <>
            <CaloriesCard consumed={overview.today.kcal} target={overview.target.kcal} tdee={overview.tdee} adaptive={overview.adaptive} />

            <section className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-surface p-4" aria-label="Macros de hoy">
              {MACROS.map((m) => {
                const consumed = overview.today[m.key]
                const target = overview.target[m.key]
                return (
                  <div key={m.key} className="flex flex-col items-center gap-1.5">
                    <Ring fraction={progressOf(consumed, target).fraction} color={m.color}>
                      <span className="text-sm font-semibold tabular-nums">{fmt(consumed)}</span>
                    </Ring>
                    <span className="text-sm font-medium">{m.label}</span>
                    <span className="text-xs text-zinc-500 tabular-nums">de {fmt(target)} g</span>
                  </div>
                )
              })}
            </section>

            <section className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">Balance semanal</h2>
                {overview.week.completeLoggedDays > 0 && (
                  <span className="text-sm text-zinc-300 tabular-nums">
                    {signed(overview.week.totalBalance)} kcal · ≈ {overview.week.estimatedKgChange > 0 ? '+' : '−'}
                    {formatDecimal(Math.abs(Math.round(overview.week.estimatedKgChange * 100) / 100))} kg
                  </span>
                )}
              </div>
              <p className="mb-2 text-xs text-zinc-500">Ingesta − gasto de cada día completo. Hoy, en curso, no cuenta.</p>
              <WeeklyBalanceChart week={overview.week} tdee={overview.tdee} />
            </section>
          </>
        )}

        <WeightQuickLog key={todayWeight.kg ?? 'none'} today={today} todayWeight={todayWeight.kg} />
      </div>
    </>
  )
}

function CaloriesCard({ consumed, target, tdee, adaptive }: { consumed: number; target: number; tdee: number; adaptive: AdaptiveTdee }) {
  const p = progressOf(consumed, target)
  return (
    <section className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4" aria-label="Calorías de hoy">
      <Ring fraction={p.fraction} color={p.over > 0 ? DATA_COLORS.surplus : '#67e8f9'} size={112} stroke={11}>
        <span>
          <span className="block text-2xl font-bold tabular-nums">{fmt(consumed)}</span>
          <span className="block text-xs text-zinc-400">de {fmt(target)}</span>
        </span>
      </Ring>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-zinc-400">kcal hoy</div>
        <div className="text-xl font-semibold tabular-nums">{p.over > 0 ? `Te has pasado ${fmt(p.over)}` : `Te quedan ${fmt(p.remaining)}`}</div>
        <div className="mt-1 text-xs text-zinc-500">
          Gasto {fmt(tdee)} kcal · {adaptiveStatusText(adaptive)}
        </div>
      </div>
    </section>
  )
}

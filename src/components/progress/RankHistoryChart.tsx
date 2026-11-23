import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RankHistoryPoint } from '../../domain/progress'
import { tierTicks } from '../../domain/progress'
import { formatRank } from '../../domain/ranking'
import { DATA_COLORS } from '../dataColors'

const short = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
const long = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const TICKS = tierTicks()

/** Posición en la escalera tras cada entreno; el eje marca dónde empieza cada tier. */
export default function RankHistoryChart({ data }: { data: RankHistoryPoint[] }) {
  const min = Math.min(...data.map((d) => d.points))
  const max = Math.max(...data.map((d) => d.points))
  const lo = [...TICKS].reverse().find((t) => t.points <= min)?.points ?? 0
  const hi = TICKS.find((t) => t.points > max)?.points ?? TICKS.at(-1)!.points + 200
  const ticks = TICKS.filter((t) => t.points >= lo && t.points <= hi).map((t) => t.points)
  const name = new Map(TICKS.map((t) => [t.points, t.name]))

  return (
    <div className="h-52" role="img" aria-label="Historial de rango">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#27272a" />
          <XAxis dataKey="at" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => short.format(t)} tick={{ fill: '#a1a1aa', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis domain={[lo, hi]} ticks={ticks} tickFormatter={(v: number) => name.get(v) ?? ''} tick={{ fill: '#a1a1aa', fontSize: 11 }} tickLine={false} axisLine={false} width={68} />
          <Tooltip
            cursor={{ stroke: '#52525b' }}
            content={({ active, payload }) => {
              const d = active ? (payload?.[0]?.payload as RankHistoryPoint | undefined) : undefined
              return d ? (
                <div className="rounded-lg border border-border bg-bg px-3 py-2 text-sm shadow-xl">
                  <div className="text-zinc-400 first-letter:uppercase">{long.format(d.at)}</div>
                  <div className="font-semibold">
                    {formatRank(d.rank)} · {d.rank.lp} LP
                  </div>
                </div>
              ) : null
            }}
          />
          <Line dataKey="points" type="stepAfter" stroke={DATA_COLORS.trend} strokeWidth={2} dot={{ r: 4, fill: DATA_COLORS.trend, stroke: '#15151d', strokeWidth: 2 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

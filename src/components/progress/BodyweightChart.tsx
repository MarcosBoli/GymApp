import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fromDateKey } from '../../domain/dates'
import { formatDecimal } from '../../domain/number'
import { DATA_COLORS } from '../dataColors'

const short = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
const long = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

/** Peso registrado (puntos) y peso tendencial (línea). */
export default function BodyweightChart({ data }: { data: { date: string; weightKg?: number; trendKg: number }[] }) {
  const points = data.map((d) => ({ ...d, t: fromDateKey(d.date).getTime() }))
  return (
    <div className="h-52" role="img" aria-label="Peso corporal y tendencia">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="#2c2222" />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => short.format(t)} tick={{ fill: '#a3a3a3', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} tick={{ fill: '#a3a3a3', fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatDecimal(Math.round(v * 10) / 10, 1)} allowDecimals />
          <Tooltip
            cursor={{ stroke: '#525252' }}
            content={({ active, payload }) => {
              const d = active ? (payload?.[0]?.payload as (typeof points)[number] | undefined) : undefined
              return d ? (
                <div className="rounded-lg border border-border bg-bg px-3 py-2 text-sm shadow-xl">
                  <div className="text-neutral-400 first-letter:uppercase">{long.format(d.t)}</div>
                  {d.weightKg !== undefined && <div className="tabular-nums">Peso {formatDecimal(d.weightKg, 1)} kg</div>}
                  <div className="font-semibold tabular-nums">Tendencia {formatDecimal(d.trendKg, 2)} kg</div>
                </div>
              ) : null
            }}
          />
          <Line dataKey="weightKg" stroke="none" isAnimationActive={false} dot={{ r: 3, fill: DATA_COLORS.rawWeight, stroke: '#15151d', strokeWidth: 1 }} activeDot={{ r: 5 }} connectNulls={false} />
          <Line dataKey="trendKg" type="monotone" isAnimationActive={false} stroke={DATA_COLORS.trend} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

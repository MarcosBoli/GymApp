import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fromDateKey } from '../../domain/dates'
import { formatDecimal } from '../../domain/number'
import { DATA_COLORS } from '../dataColors'

const short = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
const long = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

/** e1RM de un ejercicio a lo largo del tiempo (una serie: sin leyenda, el título la nombra). */
export default function E1rmChart({ data }: { data: { date: string; e1rm: number }[] }) {
  const points = data.map((d) => ({ ...d, t: fromDateKey(d.date).getTime() }))
  return (
    <div className="h-44" role="img" aria-label="Evolución del 1RM estimado">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="#2c2222" />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => short.format(t)} tick={{ fill: '#a3a3a3', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis domain={['auto', 'auto']} tick={{ fill: '#a3a3a3', fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatDecimal(Math.round(v))} />
          <Tooltip
            cursor={{ stroke: '#525252' }}
            content={({ active, payload }) => {
              const d = active ? (payload?.[0]?.payload as (typeof points)[number] | undefined) : undefined
              return d ? (
                <div className="rounded-lg border border-border bg-bg px-3 py-2 text-sm shadow-xl">
                  <div className="text-neutral-400">{long.format(d.t)}</div>
                  <div className="font-semibold tabular-nums">{formatDecimal(d.e1rm, 1)} kg e1RM</div>
                </div>
              ) : null
            }}
          />
          <Line type="monotone" dataKey="e1rm" isAnimationActive={false} stroke={DATA_COLORS.trend} strokeWidth={2} dot={{ r: 4, fill: DATA_COLORS.trend, stroke: '#171212', strokeWidth: 2 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

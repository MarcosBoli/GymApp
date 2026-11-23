import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { WeeklyBalance } from '../../domain/energy'
import { fromDateKey } from '../../domain/dates'
import { formatDecimal } from '../../domain/number'
import { DATA_COLORS } from '../dataColors'

const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'short' })
const longDay = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatDecimal(Math.abs(Math.round(n)))}`

/** Barras divergentes: ingesta − TDEE por día. Azul = déficit, rojo = superávit. Hoy solo en el tooltip. */
export function WeeklyBalanceChart({ week, tdee }: { week: WeeklyBalance; tdee: number }) {
  const data = week.days.map((d) => ({
    ...d,
    label: d.partial ? 'Hoy' : weekday.format(fromDateKey(d.date)).replace('.', ''),
    // Hoy (en curso) no se dibuja: su balance parcial es engañoso y aplasta la escala
    value: d.partial ? 0 : (d.balance ?? 0),
  }))

  return (
    <figure>
      <div className="h-40" role="img" aria-label="Balance calórico de los últimos 7 días">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#a1a1aa', fontSize: 12 }} />
            {/* El 0 siempre dentro del dominio: las barras salen de la línea base */}
            <YAxis hide domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]} />
            <ReferenceLine y={0} stroke="#52525b" />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.05)', stroke: 'none' }}
              content={({ active, payload }) => {
                const d = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined
                if (!d) return null
                return (
                  <div className="rounded-lg border border-border bg-bg px-3 py-2 text-sm shadow-xl">
                    <div className="font-medium first-letter:uppercase">{longDay.format(fromDateKey(d.date))}{d.partial ? ' (en curso)' : ''}</div>
                    {d.kcal === null ? (
                      <div className="text-zinc-400">Sin registros</div>
                    ) : d.partial ? (
                      <div className="text-zinc-400 tabular-nums">Llevas {formatDecimal(Math.round(d.kcal))} kcal · TDEE {formatDecimal(Math.round(tdee))}</div>
                    ) : (
                      <>
                        <div className="text-zinc-400 tabular-nums">Ingesta {formatDecimal(Math.round(d.kcal))} kcal · TDEE {formatDecimal(Math.round(tdee))}</div>
                        <div className="font-semibold tabular-nums">{signed(d.balance!)} kcal</div>
                      </>
                    )}
                  </div>
                )
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 4, 4]} maxBarSize={28} isAnimationActive>
              {data.map((d) => (
                <Cell key={d.date} fill={d.value <= 0 ? DATA_COLORS.deficit : DATA_COLORS.surplus} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 flex justify-center gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-deficit" />Déficit</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-surplus" />Superávit</span>
      </figcaption>
      <table className="sr-only">
        <caption>Balance diario (ingesta − TDEE)</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th scope="row">{longDay.format(fromDateKey(d.date))}</th>
              <td>{d.balance === null ? 'Sin registros' : d.partial ? 'En curso' : `${signed(d.balance)} kcal`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

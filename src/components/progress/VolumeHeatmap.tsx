import { VOLUME_BINS, volumeBin } from '../../domain/progress'
import { fromDateKey } from '../../domain/dates'
import { formatDecimal } from '../../domain/number'
import { VOLUME_INK, VOLUME_RAMP } from '../dataColors'

const weekLabel = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
/** Cabecera compacta "5/10" para que 8 semanas quepan en 390 px. */
const shortWeek = (key: string) => {
  const d = fromDateKey(key)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

/** Mapa de calor: series efectivas por músculo (filas) y semana (columnas). */
export function VolumeHeatmap({ weekStarts, rows }: { weekStarts: string[]; rows: { id: string; name: string; values: number[] }[] }) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-[2px] text-xs">
          <caption className="sr-only">Series efectivas por semana y músculo</caption>
          <colgroup>
            <col className="w-[76px]" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Músculo</span>
              </th>
              {weekStarts.map((w, i) => (
                <th key={w} scope="col" className="pb-1 text-[10px] font-normal text-zinc-500" aria-label={`Semana del ${weekLabel.format(fromDateKey(w))}`}>
                  {i === weekStarts.length - 1 ? 'Esta' : shortWeek(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" title={r.name} className="truncate pr-1 text-left font-normal text-zinc-300">
                  {r.name}
                </th>
                {r.values.map((v, i) => {
                  const bin = volumeBin(v)
                  return (
                    <td
                      key={i}
                      title={`${r.name}, semana del ${weekLabel.format(fromDateKey(weekStarts[i]!))}: ${formatDecimal(v, 1)} series`}
                      className="h-7 rounded text-center tabular-nums"
                      style={{ background: VOLUME_RAMP[bin], color: VOLUME_INK[bin], boxShadow: bin === 0 ? 'inset 0 0 0 1px #27272a' : undefined }}
                    >
                      {v > 0 ? formatDecimal(Math.round(v)) : '·'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-center gap-1 text-[11px] text-zinc-400" aria-label="Escala">
        {VOLUME_BINS.map((b, i) => (
          <span key={b.label} className="flex flex-col items-center gap-0.5">
            <span className="h-3 w-8 rounded-sm" style={{ background: VOLUME_RAMP[i], boxShadow: i === 0 ? 'inset 0 0 0 1px #3f3f46' : undefined }} />
            <span className={i === 3 || i === 4 ? 'font-semibold text-zinc-200' : ''}>{b.label}</span>
          </span>
        ))}
      </div>
      <p className="mt-1 text-center text-[11px] text-zinc-500">Series/semana · óptimo 10-20 (secundarios cuentan 0,5)</p>
    </div>
  )
}

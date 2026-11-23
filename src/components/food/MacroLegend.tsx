import { formatDecimal } from '../../domain/number'
import { DATA_COLORS } from '../dataColors'

const MACROS = [
  { key: 'proteinG', label: 'Proteína', color: DATA_COLORS.protein },
  { key: 'carbsG', label: 'Carbohidratos', color: DATA_COLORS.carbs },
  { key: 'fatG', label: 'Grasa', color: DATA_COLORS.fat },
] as const

export { MACROS }

/** Gramos de cada macro con su marca de color (el texto siempre en tinta neutra). */
export function MacroLegend(n: { proteinG: number; carbsG: number; fatG: number }) {
  return (
    <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
      {MACROS.map((m) => (
        <div key={m.key}>
          <dt className="flex items-center gap-1.5 text-neutral-400">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
            {m.label}
          </dt>
          <dd className="font-semibold tabular-nums">{formatDecimal(Math.round(n[m.key] * 10) / 10, 1)} g</dd>
        </div>
      ))}
    </dl>
  )
}

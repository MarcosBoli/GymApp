import { useState } from 'react'
import { parseBodyweight } from '../../domain/energy'
import { formatDecimal } from '../../domain/number'
import { logBodyweight } from '../../db/food'

/** Registro rápido del peso del día (el TDEE adaptativo necesita pesajes frecuentes). */
export function WeightQuickLog({ today, todayWeight }: { today: string; todayWeight?: number }) {
  const [text, setText] = useState(todayWeight !== undefined ? formatDecimal(todayWeight) : '')
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const kg = parseBodyweight(text)
    if (kg === null) return setState('error')
    await logBodyweight(today, kg)
    setState('saved')
  }

  return (
    <form onSubmit={save} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
      <label className="flex-1">
        <span className="block text-sm text-neutral-400">Peso de hoy</span>
        <span className="flex items-baseline gap-1">
          <input
            type="text"
            inputMode="decimal"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setState('idle')
            }}
            placeholder="—"
            className="w-24 bg-transparent !text-2xl font-bold tabular-nums outline-none"
          />
          <span className="text-neutral-400">kg</span>
        </span>
        {state === 'error' && <span className="block text-sm text-red-300">Entre 30 y 300 kg.</span>}
      </label>
      <button type="submit" className="h-11 rounded-xl bg-white/5 px-4 font-semibold active:bg-white/10">
        {state === 'saved' ? 'Guardado ✓' : 'Guardar'}
      </button>
    </form>
  )
}

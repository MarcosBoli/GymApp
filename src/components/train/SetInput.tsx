import { useState } from 'react'
import { parseSetInput } from '../../domain/workout'
import { formatDecimal, stepDecimal } from '../../domain/number'

interface Props {
  setNumber: number
  suggestion: { weightKg: number; reps: number } | null
  bodyweight: boolean
  onSave: (values: { weightKg: number; reps: number; rpe?: number; isWarmup: boolean }) => void
}

const RPE_OPTIONS = ['', '6', '6,5', '7', '7,5', '8', '8,5', '9', '9,5', '10']

/** Entrada de una serie: números grandes y botones +/− pensados para el pulgar. */
export function SetInput({ setNumber, suggestion, bodyweight, onSave }: Props) {
  const [weight, setWeight] = useState(suggestion ? formatDecimal(suggestion.weightKg) : bodyweight ? '0' : '')
  const [reps, setReps] = useState(suggestion ? String(suggestion.reps) : '')
  const [rpe, setRpe] = useState('')
  const [warmup, setWarmup] = useState(false)
  const [error, setError] = useState<string>()

  function save() {
    const result = parseSetInput({ weight, reps, rpe }, { bodyweight })
    if (!result.ok) return setError(result.error)
    setError(undefined)
    onSave({ ...result.value, isWarmup: warmup })
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Stepper
          label={bodyweight ? 'Lastre (kg)' : 'Peso (kg)'}
          value={weight}
          onChange={setWeight}
          onStep={(d) => setWeight(stepDecimal(weight, d * 2.5, bodyweight ? -500 : 0))}
          inputMode="decimal"
        />
        <Stepper label="Reps" value={reps} onChange={setReps} onStep={(d) => setReps(stepDecimal(reps, d, 1))} inputMode="numeric" />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setWarmup(!warmup)}
          aria-pressed={warmup}
          className={`h-11 flex-1 rounded-xl border text-sm font-medium transition ${
            warmup ? 'border-amber-400/60 bg-amber-400/10 text-amber-300' : 'border-border text-zinc-400'
          }`}
        >
          Calentamiento
        </button>
        <label className="flex h-11 flex-1 items-center justify-between rounded-xl border border-border px-3 text-sm text-zinc-400">
          RPE
          <select value={rpe} onChange={(e) => setRpe(e.target.value)} className="bg-transparent text-right text-zinc-100 outline-none">
            {RPE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o || '—'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <button
        type="button"
        onClick={save}
        className="h-14 w-full rounded-2xl bg-accent text-lg font-bold text-bg transition active:scale-[0.98]"
      >
        ✓ Guardar serie {setNumber}
      </button>
    </div>
  )
}

function Stepper(props: {
  label: string
  value: string
  onChange: (v: string) => void
  onStep: (direction: 1 | -1) => void
  inputMode: 'decimal' | 'numeric'
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg/60 p-2">
      <div className="text-center text-xs text-zinc-500">{props.label}</div>
      <input
        type="text"
        inputMode={props.inputMode}
        enterKeyHint="done"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        aria-label={props.label}
        className="h-12 w-full min-w-0 bg-transparent text-center !text-3xl font-bold tabular-nums outline-none"
      />
      <div className="mt-1 grid grid-cols-2 gap-2">
        <StepButton onClick={() => props.onStep(-1)} label={`Restar ${props.label}`}>
          −
        </StepButton>
        <StepButton onClick={() => props.onStep(1)} label={`Sumar ${props.label}`}>
          +
        </StepButton>
      </div>
    </div>
  )
}

function StepButton({ onClick, label, children }: { onClick: () => void; label: string; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="h-11 rounded-xl bg-white/5 text-2xl text-zinc-300 active:bg-white/10"
    >
      {children}
    </button>
  )
}

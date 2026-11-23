import { useState } from 'react'
import type { MealType } from '../../domain/types'
import { draftToForm, validateFoodForm, type FoodDraft, type FoodForm, type FoodFormErrors } from '../../domain/food'
import { saveFood } from '../../db/food'
import { useFoodUi } from '../../store/foodUi'

const FIELDS: { key: keyof FoodForm; label: string; numeric?: boolean; full?: boolean }[] = [
  { key: 'name', label: 'Nombre', full: true },
  { key: 'brand', label: 'Marca (opcional)', full: true },
  { key: 'kcal', label: 'kcal / 100 g', numeric: true },
  { key: 'proteinG', label: 'Proteína (g)', numeric: true },
  { key: 'carbsG', label: 'Carbohidratos (g)', numeric: true },
  { key: 'fatG', label: 'Grasa (g)', numeric: true },
  { key: 'servingG', label: 'Ración (g, opcional)', numeric: true },
  { key: 'barcode', label: 'Código de barras', numeric: true },
]

export function FoodFormView({ mealType, draft, foodId, notice }: { mealType: MealType; draft?: FoodDraft; foodId?: string; notice?: string }) {
  const open = useFoodUi((s) => s.open)
  const [form, setForm] = useState<FoodForm>(() => draftToForm(draft))
  const [errors, setErrors] = useState<FoodFormErrors>({})
  const [warning, setWarning] = useState<string>()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const r = validateFoodForm(form)
    if (!r.ok) return setErrors(r.errors)
    setErrors({})
    // Si las kcal no cuadran, se avisa una vez; un segundo toque guarda igualmente
    if (r.warning && r.warning !== warning) return setWarning(r.warning)
    const food = await saveFood(r.value, Date.now(), foodId ? { id: foodId } : { source: 'manual' })
    open({ kind: 'quantity', mealType, foodId: food.id })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {notice && <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-amber-200">{notice}</p>}
      <p className="text-sm text-neutral-500">Valores por 100 g, tal y como vienen en la etiqueta.</p>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className={`block ${f.full ? 'col-span-2' : ''}`}>
            <span className="mb-1 block text-sm text-neutral-400">{f.label}</span>
            <input
              type="text"
              inputMode={f.numeric ? (f.key === 'barcode' ? 'numeric' : 'decimal') : 'text'}
              value={form[f.key]}
              onChange={(e) => {
                setForm({ ...form, [f.key]: e.target.value })
                setWarning(undefined)
              }}
              className="h-12 w-full rounded-xl border border-border bg-surface px-3 outline-none focus:border-accent/60"
            />
            {errors[f.key] && <span className="mt-1 block text-sm text-red-300">{errors[f.key]}</span>}
          </label>
        ))}
      </div>
      {warning && <p className="text-sm text-amber-300">{warning} Pulsa Guardar otra vez para guardarlo igualmente.</p>}
      <button type="submit" className="h-14 w-full rounded-2xl bg-accent text-lg font-bold text-bg active:scale-[0.98]">
        Guardar
      </button>
    </form>
  )
}

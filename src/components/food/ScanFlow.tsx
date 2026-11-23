import { lazy, Suspense, useState } from 'react'
import type { MealType } from '../../domain/types'
import { normalizeBarcode } from '../../domain/food'
import { resolveBarcode } from '../../db/barcode'
import { fetchOffProduct } from '../../lib/openFoodFacts'
import { useFoodUi } from '../../store/foodUi'

// zxing pesa: se carga solo al abrir el escáner (sigue precacheado para offline)
const BarcodeScanner = lazy(() => import('./BarcodeScanner'))

const NOTICES = {
  not_found: 'Producto no encontrado en Open Food Facts. Créalo a mano.',
  incomplete: 'Open Food Facts no tiene todos los datos. Complétalos.',
  offline: 'Sin conexión. Créalo a mano (quedará guardado para la próxima vez).',
  error: 'No se pudo consultar Open Food Facts. Créalo a mano.',
} as const

export function ScanFlow({ mealType }: { mealType: MealType }) {
  const open = useFoodUi((s) => s.open)
  const [looking, setLooking] = useState<string>()
  const [manual, setManual] = useState('')
  const [manualError, setManualError] = useState<string>()

  async function handle(code: string) {
    setLooking(code)
    const r = await resolveBarcode(code, Date.now(), { fetchProduct: fetchOffProduct, online: navigator.onLine })
    if (r.kind === 'found') open({ kind: 'quantity', mealType, foodId: r.food.id })
    else open({ kind: 'form', mealType, draft: r.draft, notice: NOTICES[r.reason] })
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault()
    const code = normalizeBarcode(manual)
    if (!code) return setManualError('Código no válido (8, 12 o 13 dígitos).')
    setManualError(undefined)
    void handle(code)
  }

  if (looking) {
    return <p className="py-16 text-center text-neutral-400">Buscando {looking}…</p>
  }

  return (
    <div className="space-y-4">
      <Suspense fallback={<div className="aspect-[3/4] w-full animate-pulse rounded-2xl bg-surface" />}>
        <BarcodeScanner onDetected={handle} />
      </Suspense>
      <p className="text-center text-sm text-neutral-500">Apunta al código de barras del envase.</p>
      <form onSubmit={submitManual} className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="O escribe el código"
          aria-label="Código de barras"
          className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 outline-none focus:border-accent/60"
        />
        <button type="submit" className="h-12 rounded-xl bg-white/5 px-4 font-semibold active:bg-white/10">
          Buscar
        </button>
      </form>
      {manualError && <p className="text-sm text-red-300">{manualError}</p>}
    </div>
  )
}

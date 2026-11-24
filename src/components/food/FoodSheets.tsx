import { lazy, Suspense } from 'react'
import { MEAL_TYPES } from '../../domain/food'
import { useFoodUi } from '../../store/foodUi'
import { Sheet } from '../Sheet'
import { AddFood } from './AddFood'
import { ScanFlow } from './ScanFlow'
import { QuantityForm } from './QuantityForm'
import { FoodFormView } from './FoodFormView'

// Foto o descripción con IA: se descarga al abrirla
const EstimateFlow = lazy(() => import('./EstimateFlow'))

const TITLES = { add: 'Añadir a', scan: 'Escanear para', quantity: '', form: 'Alimento' } as const

/** Host de las hojas de Comida (una a la vez, según el store). */
export function FoodSheets({ date }: { date: string }) {
  const { sheet, close } = useFoodUi()
  const mealLabel = sheet ? (MEAL_TYPES.find((m) => m.id === sheet.mealType)?.label ?? '') : ''
  const title = !sheet
    ? ''
    : sheet.kind === 'quantity'
      ? mealLabel
      : sheet.kind === 'estimate'
        ? sheet.mode === 'photo' ? 'Foto con IA' : 'Describir comida'
        : sheet.kind === 'form'
          ? TITLES.form
          : `${TITLES[sheet.kind]} ${mealLabel.toLowerCase()}`

  return (
    <Sheet open={sheet !== null} title={title} onClose={close}>
      {sheet?.kind === 'add' && <AddFood mealType={sheet.mealType} today={date} />}
      {sheet?.kind === 'scan' && <ScanFlow mealType={sheet.mealType} />}
      {sheet?.kind === 'estimate' && (
        <Suspense fallback={<p className="py-8 text-center text-neutral-400">Cargando…</p>}>
          <EstimateFlow key={sheet.mode} mode={sheet.mode} mealType={sheet.mealType} date={date} />
        </Suspense>
      )}
      {sheet?.kind === 'quantity' && (
        <QuantityForm key={sheet.foodId + (sheet.itemId ?? '')} mealType={sheet.mealType} mealLabel={mealLabel.toLowerCase()} date={date} foodId={sheet.foodId} itemId={sheet.itemId} grams={sheet.grams} />
      )}
      {sheet?.kind === 'form' && <FoodFormView key={sheet.foodId ?? 'new'} mealType={sheet.mealType} draft={sheet.draft} foodId={sheet.foodId} notice={sheet.notice} />}
    </Sheet>
  )
}

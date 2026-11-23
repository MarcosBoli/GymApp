import { describe, expect, it } from 'vitest'
import {
  draftToForm,
  foodSubtitle,
  isCompleteDraft,
  isValidGtin,
  itemNutrition,
  macroKcal,
  mealItemSnapshot,
  normalizeBarcode,
  nutritionFor,
  parseGrams,
  parseOffProduct,
  quickGramOptions,
  searchFoods,
  sumNutrition,
  validateFoodForm,
  type FoodForm,
} from './food'

describe('nutrición', () => {
  it('escala por gramos', () => {
    expect(nutritionFor({ kcal: 360, proteinG: 7, carbsG: 79, fatG: 1 }, 150)).toEqual({ kcal: 540, proteinG: 10.5, carbsG: 118.5, fatG: 1.5 })
    expect(itemNutrition({ grams: 50, kcal: 100, proteinG: 10, carbsG: 0, fatG: 6 })).toEqual({ kcal: 50, proteinG: 5, carbsG: 0, fatG: 3 })
  })

  it('suma y kcal de macros', () => {
    expect(sumNutrition([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })
    expect(sumNutrition([{ kcal: 1, proteinG: 2, carbsG: 3, fatG: 4 }, { kcal: 10, proteinG: 20, carbsG: 30, fatG: 40 }])).toEqual({ kcal: 11, proteinG: 22, carbsG: 33, fatG: 44 })
    expect(macroKcal({ proteinG: 10, carbsG: 10, fatG: 10 })).toBe(170)
  })

  it('snapshot del alimento para el mealItem', () => {
    expect(mealItemSnapshot({ id: 'f', name: 'Arroz', kcal: 360, proteinG: 7, carbsG: 79, fatG: 1, servingG: 80, isFavorite: true })).toEqual({
      foodId: 'f', foodName: 'Arroz', kcal: 360, proteinG: 7, carbsG: 79, fatG: 1,
    })
  })

  it('opciones rápidas de gramos', () => {
    expect(quickGramOptions()).toEqual([50, 100, 150, 200])
    expect(quickGramOptions(30)).toEqual([30, 50, 100, 150, 200])
    expect(quickGramOptions(100)).toEqual([100, 50, 150, 200])
    expect(quickGramOptions(0)).toEqual([50, 100, 150, 200])
  })

  it.each([
    ['150', 150],
    ['12,5', 12.5],
    ['0', null],
    ['-5', null],
    ['', null],
    ['6000', null],
  ])('parseGrams("%s") → %s', (t, g) => {
    expect(parseGrams(t)).toBe(g)
  })
})

describe('searchFoods', () => {
  const foods = [
    { id: 1, name: 'Yogur griego', brand: 'Hacendado', isFavorite: false },
    { id: 2, name: 'Pechuga de pollo', brand: undefined, isFavorite: true },
    { id: 3, name: 'Arroz basmati', brand: 'SOS', isFavorite: false },
    { id: 4, name: 'Plátano', brand: undefined, isFavorite: false },
    { id: 5, name: 'Pan de pollo', brand: undefined, isFavorite: false },
  ]
  const ids = (q: string) => searchFoods(foods, q).map((f) => f.id)

  it('busca por nombre y marca, sin tildes', () => {
    expect(ids('platano')).toEqual([4])
    expect(ids('hacendado')).toEqual([1])
    expect(ids('arroz sos')).toEqual([3])
  })

  it('favoritos primero, luego por coincidencia y alfabético', () => {
    expect(ids('pollo')).toEqual([2, 5])
    expect(ids('')).toEqual([2, 3, 5, 4, 1])
  })
})

describe('códigos de barras', () => {
  it.each([
    ['3017620422003', true], // Nutella
    ['8410076472885', true],
    ['3017620422004', false],
    ['96385074', true], // EAN-8
    ['036000291452', true], // UPC-A
    ['12345', false],
    ['abcdefghijklm', false],
  ])('isValidGtin(%s) → %s', (code, ok) => {
    expect(isValidGtin(code)).toBe(ok)
  })

  it('normaliza espacios y guiones', () => {
    expect(normalizeBarcode(' 3017620-422003 ')).toBe('3017620422003')
    expect(normalizeBarcode('3017620422004')).toBeNull()
  })
})

describe('parseOffProduct', () => {
  const full = {
    code: '3017620422003',
    status: 1,
    product: {
      product_name: 'Nutella',
      product_name_es: 'Nutella crema de cacao',
      brands: 'Ferrero, Nutella',
      serving_quantity: 15,
      nutriments: { 'energy-kcal_100g': 539, 'energy-kj_100g': 2252, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
    },
  }

  it('extrae nombre en español, marca, macros y ración', () => {
    expect(parseOffProduct(full, '3017620422003')).toEqual({
      name: 'Nutella crema de cacao', brand: 'Ferrero', barcode: '3017620422003', kcal: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9, servingG: 15,
    })
  })

  it('calcula kcal desde kJ si faltan', () => {
    const d = parseOffProduct({ product: { product_name: 'X', nutriments: { 'energy-kj_100g': 418.4, proteins_100g: '1,26', carbohydrates_100g: 2, fat_100g: 0 } } }, '1')
    expect(d).toMatchObject({ kcal: 100, proteinG: 1.3 })
    expect(parseOffProduct({ product: { product_name: 'X', nutriments: { energy_100g: 836.8 } } }, '1')?.kcal).toBe(200)
  })

  it('producto incompleto: campos sin valor', () => {
    const d = parseOffProduct({ product: { nutriments: { fat_100g: -1 } } }, '123')!
    expect(d).toEqual({ name: '', brand: undefined, barcode: '123', kcal: undefined, proteinG: undefined, carbsG: undefined, fatG: undefined, servingG: undefined })
    expect(isCompleteDraft(d)).toBe(false)
    expect(isCompleteDraft(parseOffProduct(full, '3017620422003')!)).toBe(true)
  })

  it('no encontrado o respuesta rara → null', () => {
    expect(parseOffProduct({ status: 0, status_verbose: 'product not found' }, '1')).toBeNull()
    expect(parseOffProduct(null, '1')).toBeNull()
    expect(parseOffProduct('x', '1')).toBeNull()
  })
})

describe('validateFoodForm', () => {
  const valid: FoodForm = { name: ' Arroz ', brand: '', barcode: '', kcal: '360', proteinG: '7', carbsG: '79', fatG: '0,6', servingG: '' }

  it('acepta y normaliza', () => {
    expect(validateFoodForm(valid)).toEqual({ ok: true, value: { name: 'Arroz', kcal: 360, proteinG: 7, carbsG: 79, fatG: 0.6 } })
    const r = validateFoodForm({ ...valid, brand: ' SOS ', barcode: '3017620422003', servingG: '80' })
    expect(r.ok && r.value).toMatchObject({ brand: 'SOS', barcode: '3017620422003', servingG: 80 })
  })

  it.each([
    [{ name: '  ' }, 'name'],
    [{ kcal: '' }, 'kcal'],
    [{ kcal: '1000' }, 'kcal'],
    [{ proteinG: '-1' }, 'proteinG'],
    [{ carbsG: 'x' }, 'carbsG'],
    [{ proteinG: '50', carbsG: '40', fatG: '20' }, 'fatG'],
    [{ servingG: '0' }, 'servingG'],
    [{ barcode: '123' }, 'barcode'],
  ] as const)('rechaza %o', (patch, field) => {
    const r = validateFoodForm({ ...valid, ...patch })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors)).toEqual([field])
  })

  it('avisa si las kcal no cuadran con los macros', () => {
    const r = validateFoodForm({ ...valid, kcal: '100' })
    expect(r.ok && r.warning).toContain('no cuadran')
    expect(validateFoodForm(valid)).not.toHaveProperty('warning')
  })

  it('draftToForm usa coma decimal y vacíos', () => {
    expect(draftToForm({ name: 'X', kcal: 100, fatG: 0.5 })).toEqual({ name: 'X', brand: '', barcode: '', kcal: '100', proteinG: '', carbsG: '', fatG: '0,5', servingG: '' })
    expect(draftToForm().name).toBe('')
  })
})

describe('foodSubtitle', () => {
  it('marca, estimado por foto o sin marca', () => {
    expect(foodSubtitle({ brand: 'Hacendado', source: 'ia-foto' })).toBe('Hacendado')
    expect(foodSubtitle({ source: 'ia-foto' })).toBe('Estimado con IA (foto)')
    expect(foodSubtitle({ source: 'manual' })).toBe('Sin marca')
    expect(foodSubtitle({})).toBe('Sin marca')
  })
})

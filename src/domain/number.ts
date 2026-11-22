/**
 * Convierte el texto de un input numérico (inputMode="decimal") a número.
 * El teclado iOS en español usa coma decimal: acepta "72,5" y "72.5".
 * Devuelve null si el texto está vacío o no es un número finito.
 */
export function parseDecimal(input: string): number | null {
  const normalized = input.trim().replace(/\s+/g, '').replace(',', '.')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

/** Formatea con coma decimal (es-ES), hasta 2 decimales y sin separador de miles. */
export function formatDecimal(value: number, maxDecimals = 2): string {
  return value.toLocaleString('es-ES', { maximumFractionDigits: maxDecimals, useGrouping: false })
}

/** Suma `delta` al número escrito (vacío o inválido = 0), sin bajar de `min`, y lo devuelve formateado. */
export function stepDecimal(text: string, delta: number, min = 0): string {
  const current = parseDecimal(text) ?? 0
  const next = Math.max(min, Math.round((current + delta) * 100) / 100)
  return formatDecimal(next)
}

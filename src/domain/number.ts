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

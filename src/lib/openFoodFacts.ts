/** Consulta un producto en la API pública de Open Food Facts (sin clave, con CORS). */
export async function fetchOffProduct(barcode: string, timeoutMs = 8000): Promise<unknown | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,product_name_es,generic_name,generic_name_es,brands,nutriments,serving_quantity`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Open Food Facts respondió ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

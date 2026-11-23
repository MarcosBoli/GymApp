/**
 * Pide al navegador almacenamiento persistente para que IndexedDB no se
 * borre bajo presión de espacio. Devuelve true si queda persistente.
 */
export async function requestPersistentStorage(
  storage: StorageManager | undefined = globalThis.navigator?.storage,
): Promise<boolean> {
  if (!storage || typeof storage.persist !== 'function') return false
  try {
    return await storage.persist()
  } catch {
    return false
  }
}

import { describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage } from './persist'

describe('requestPersistentStorage', () => {
  it('devuelve false si la API no existe', async () => {
    expect(await requestPersistentStorage(undefined)).toBe(false)
  })

  it('llama a persist() y devuelve su resultado', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    expect(await requestPersistentStorage({ persist } as unknown as StorageManager)).toBe(true)
    expect(persist).toHaveBeenCalledOnce()
  })

  it('devuelve false si persist() falla', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('nope'))
    expect(await requestPersistentStorage({ persist } as unknown as StorageManager)).toBe(false)
  })
})

/**
 * Secreto de la app (cabecera x-app-secret) guardado solo en este dispositivo.
 * localStorage y no IndexedDB: así nunca viaja dentro de un backup exportado.
 */
const KEY = 'gymapp-app-secret'

export const getAiSecret = (): string => localStorage.getItem(KEY) ?? ''
export const setAiSecret = (secret: string) => localStorage.setItem(KEY, secret.trim())
export const clearAiSecret = () => localStorage.removeItem(KEY)

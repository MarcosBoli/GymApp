/**
 * Texto que el usuario está escribiendo en "Describir" (localStorage): si iOS cierra la app
 * a mitad, al volver sigue ahí. Se borra al guardar la comida.
 */
const KEY = 'gymapp-describe-draft'

export function loadDescribeDraft(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveDescribeDraft(text: string): void {
  try {
    if (text.trim()) localStorage.setItem(KEY, text)
    else localStorage.removeItem(KEY)
  } catch {
    // almacenamiento lleno o bloqueado: solo se pierde el borrador
  }
}

export const clearDescribeDraft = (): void => saveDescribeDraft('')

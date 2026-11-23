/** Tamaño para que el lado mayor no pase de `max` (sin ampliar nunca), redondeado a píxeles. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (!(width > 0 && height > 0)) return { width: 0, height: 0 }
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Quita la cabecera `data:…;base64,` de un data URL. */
export const stripDataUrl = (dataUrl: string): string => dataUrl.slice(dataUrl.indexOf(',') + 1)

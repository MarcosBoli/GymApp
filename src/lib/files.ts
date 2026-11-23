export type SaveFileResult = 'shared' | 'downloaded' | 'cancelled'

/**
 * Guarda un JSON como archivo. En móvil (iOS) abre la hoja de compartir
 * ("Guardar en Archivos"), porque <a download> funciona mal en PWAs instaladas.
 * En escritorio, o si compartir no está permitido, descarga el archivo.
 */
export async function saveJsonFile(fileName: string, data: unknown): Promise<SaveFileResult> {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const file = new File([blob], fileName, { type: 'application/json' })

  const isTouch = window.matchMedia('(pointer: coarse)').matches
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // NotAllowedError u otros: se intenta la descarga normal
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}

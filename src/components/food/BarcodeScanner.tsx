import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { normalizeBarcode } from '../../domain/food'

const HINTS = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
])

function cameraError(err: unknown): string {
  if (!window.isSecureContext) return 'La cámara necesita HTTPS. Abre la app desde su URL de Vercel.'
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError') return 'Permiso de cámara denegado. Actívalo en Ajustes › Safari › Cámara.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No se ha encontrado ninguna cámara.'
  return 'No se pudo abrir la cámara.'
}

/** Vídeo de la cámara trasera que llama a onDetected con el primer código válido. */
export default function BarcodeScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string>()
  const detected = useRef(onDetected)
  detected.current = onDetected

  useEffect(() => {
    let controls: IScannerControls | undefined
    let cancelled = false
    const reader = new BrowserMultiFormatReader(HINTS)
    reader
      .decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video.current!, (result, _err, ctrl) => {
        const code = result && normalizeBarcode(result.getText())
        if (code) {
          ctrl.stop()
          detected.current(code)
        }
      })
      .then((c) => {
        if (cancelled) c.stop()
        else controls = c
      })
      .catch((err: unknown) => !cancelled && setError(cameraError(err)))
    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [])

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-black">
      <video ref={video} className="h-full w-full object-cover" muted playsInline autoPlay />
      {error ? (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-zinc-300">{error}</p>
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-28 -translate-y-1/2 rounded-xl border-2 border-accent/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      )}
    </div>
  )
}

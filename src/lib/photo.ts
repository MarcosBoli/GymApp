import { fitWithin, stripDataUrl } from '../domain/imageSize'

export const PHOTO_MAX_SIDE = 1024
export const PHOTO_JPEG_QUALITY = 0.8

export interface PreparedPhoto {
  /** JPEG en base64 (sin cabecera) para /api/food-estimate. */
  base64: string
  /** Para la miniatura. */
  dataUrl: string
  width: number
  height: number
}

export class PhotoReadError extends Error {
  constructor() {
    super('No se pudo leer la imagen. Prueba con otra foto.')
  }
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

/**
 * Prepara la foto para enviarla: lado mayor ≤ 1024 px y JPEG calidad 0,8.
 * La orientación EXIF se corrige al decodificar con <img> (los navegadores aplican
 * `image-orientation: from-image` y drawImage la respeta), así que la foto vertical del
 * iPhone llega vertical. Fondo blanco por si la imagen trae transparencia.
 */
export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.style.imageOrientation = 'from-image'
    img.src = url
    await img.decode().catch(() => {
      throw new PhotoReadError()
    })
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, PHOTO_MAX_SIDE)
    if (!width || !height) throw new PhotoReadError()
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new PhotoReadError()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY))
    if (!blob) throw new PhotoReadError()
    const dataUrl = await blobToDataUrl(blob)
    return { base64: stripDataUrl(dataUrl), dataUrl, width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Errores de la IA (funciones /api): códigos compartidos por servidor y app, con un
 * mensaje comprensible para el usuario. Sin dependencias: lo importa también el servidor.
 */

/** Límite de tamaño del cuerpo de una petición a /api (lo comprueban app y servidor). */
export const AI_MAX_BODY_BYTES = 64 * 1024

export const AI_ERROR_MESSAGES = {
  // Petición / configuración
  missing_secret: 'Falta el secreto de la app. Guárdalo en Perfil › Asistente IA.',
  unauthorized: 'El secreto de la app no es correcto. Revísalo en Perfil › Asistente IA.',
  payload_too_large: 'La petición es demasiado grande. Prueba con menos texto o menos historial.',
  invalid_json: 'La petición no es un JSON válido.',
  invalid_request: 'La petición no es válida.',
  method_not_allowed: 'Método no permitido.',
  not_configured: 'El servidor no está configurado: faltan variables de entorno en Vercel (ANTHROPIC_API_KEY o APP_SECRET).',
  not_deployed: 'Las funciones de IA no están desplegadas en esta versión de la app.',
  // Proveedor (Anthropic)
  no_credit: 'La cuenta de Anthropic no tiene saldo. Recarga créditos en console.anthropic.com.',
  spend_limit: 'Se ha alcanzado el límite de gasto de la cuenta de Anthropic. Súbelo en la consola o espera al próximo periodo.',
  rate_limited: 'Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo.',
  ai_auth: 'La API key de Anthropic del servidor no es válida o no tiene permisos.',
  model_not_found: 'El modelo configurado (PLAN_MODEL / CHAT_MODEL) no existe o la cuenta no tiene acceso.',
  ai_bad_request: 'La IA ha rechazado la petición por su formato o tamaño.',
  ai_unavailable: 'El servicio de IA está saturado o caído. Inténtalo en unos minutos.',
  ai_unreachable: 'El servidor no pudo conectar con la IA. Inténtalo de nuevo.',
  refused: 'La IA no ha querido responder a esta petición.',
  timeout: 'La IA ha tardado demasiado en responder. Inténtalo de nuevo (o pide algo más corto).',
  // Cliente
  offline: 'Sin conexión. La IA necesita internet; el resto de la app funciona offline.',
  network: 'No se pudo contactar con el servidor. Comprueba tu conexión.',
  server_error: 'Error inesperado del servidor. Inténtalo de nuevo.',
} as const

export type AiErrorCode = keyof typeof AI_ERROR_MESSAGES

export interface AiErrorInfo {
  code: AiErrorCode
  message: string
}

export const isAiErrorCode = (v: unknown): v is AiErrorCode => typeof v === 'string' && Object.hasOwn(AI_ERROR_MESSAGES, v)

export const aiError = (code: AiErrorCode): AiErrorInfo => ({ code, message: AI_ERROR_MESSAGES[code] })

/**
 * Interpreta una respuesta fallida de /api: nuestro JSON `{ error: { code } }` o,
 * si no lo es (timeout de Vercel, 404 sin funciones, límite de la plataforma…), el estado HTTP.
 */
export function aiErrorFromResponse(status: number, body: unknown): AiErrorInfo {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code
  if (isAiErrorCode(code)) return aiError(code)
  if (status === 401) return aiError('unauthorized')
  if (status === 404) return aiError('not_deployed')
  if (status === 413) return aiError('payload_too_large')
  if (status === 504 || status === 408) return aiError('timeout')
  if (status === 429) return aiError('rate_limited')
  return aiError('server_error')
}

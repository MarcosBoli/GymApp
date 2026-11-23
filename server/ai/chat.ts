import type Anthropic from '@anthropic-ai/sdk'
import { aiError } from '../../src/domain/aiErrors.js'
import { CHAT_STREAM_CONTENT_TYPE, encodeChatEvent, type ChatStreamEvent } from '../../src/domain/chatStream.js'
import { mapAnthropicError, modelOptions, type AiClient } from './claude.js'
import type { ChatRequest } from './validate.js'

export const CHAT_SYSTEM = `Eres el coach de GymApp: un entrenador de fuerza experto que acompaña al usuario mientras entrena.

Cómo respondes:
- En español de España, cortas y prácticas: lo que el usuario puede aplicar en la siguiente serie. Normalmente 3-8 frases o una lista breve; amplía solo si te lo piden.
- Formato sencillo: párrafos cortos, listas con "- " o "1. " y **negrita** para lo clave. Sin títulos, tablas ni emojis.
- Si preguntan cómo se hace un ejercicio: técnica paso a paso (preparación, ejecución, respiración), errores comunes y señales de que se está haciendo bien.
- Si piden alternativas: propón ejercicios que trabajen los mismos músculos con el material que el usuario tiene disponible (lo verás en sus datos) y di por qué encajan.
- Usa los datos de su app (ejercicio, rutina de la semana, rangos y marcas) cuando ayuden, sin repetirlos enteros. No inventes datos que no tengas.
- No calcules ni cambies los pesos del plan: los calcula la app. Puedes orientar sobre esfuerzo (RPE, repeticiones en reserva) y progresión.

Dolor y lesiones:
- Si el usuario menciona dolor (no la fatiga o las agujetas normales), recomienda parar ese ejercicio y consultar con un fisioterapeuta o un médico.
- No diagnostiques, no pongas nombre a la posible lesión ni des tratamientos. Puedes sugerir revisar la técnica o la carga cuando ya no haya dolor, y alternativas que no lo provoquen.

Mantente en temas de entrenamiento, técnica, recuperación y nutrición deportiva general.`

const STREAM_HEADERS = {
  'content-type': `${CHAT_STREAM_CONTENT_TYPE}; charset=utf-8`,
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
}

export interface ChatStreamOptions {
  /** Instante (ms) a partir del cual se corta la respuesta como truncada (por debajo del maxDuration). */
  deadline: number
  now: () => number
  /** Timeout del SDK hasta que empieza el stream (por intento). */
  connectTimeoutMs?: number
}

/**
 * Abre el stream con Claude y lo reenvía como NDJSON. Los errores antes de empezar
 * (saldo, auth, modelo…) se lanzan para que el handler responda con su JSON y estado;
 * los de en medio del stream llegan como evento `error`.
 */
export async function streamChat(client: AiClient, model: string, req: ChatRequest, opts: ChatStreamOptions): Promise<Response> {
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: CHAT_SYSTEM }]
  if (req.context) system.push({ type: 'text', text: `Datos del usuario (de su app):\n${req.context}` })

  const upstream = new AbortController()
  const stream = await client.beta.messages.create(
    { model, max_tokens: 1500, system, messages: req.messages, stream: true, ...modelOptions(model, 'low') },
    { timeout: opts.connectTimeoutMs ?? 20_000, maxRetries: 1, signal: upstream.signal },
  )

  let deadlineHit = false
  const timer = setTimeout(() => {
    deadlineHit = true
    upstream.abort()
  }, Math.max(0, opts.deadline - opts.now()))

  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatStreamEvent) => controller.enqueue(encoder.encode(encodeChatEvent(e)))
      let servedBy = model
      let stopReason: string | null = null
      try {
        for await (const event of stream) {
          if (event.type === 'message_start') servedBy = event.message.model
          else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') send({ type: 'delta', text: event.delta.text })
          else if (event.type === 'message_delta') stopReason = event.delta.stop_reason ?? stopReason
        }
        // Negativa de toda la cadena: el texto parcial no vale (la app lo descarta)
        if (stopReason === 'refusal') send({ type: 'error', error: aiError('refused') })
        else send({ type: 'done', model: servedBy, truncated: stopReason === 'max_tokens' })
      } catch (err) {
        if (deadlineHit) send({ type: 'done', model: servedBy, truncated: true })
        else if (!upstream.signal.aborted) {
          const { code, status } = mapAnthropicError(err)
          if (status >= 500) console.error('[ai] chat stream', code, err)
          send({ type: 'error', error: aiError(code) })
        }
      } finally {
        clearTimeout(timer)
        try {
          controller.close()
        } catch {
          // ya cerrado (el cliente canceló)
        }
      }
    },
    cancel() {
      // El usuario cerró el chat o pulsó "Parar": deja de pedir tokens a Claude
      clearTimeout(timer)
      upstream.abort()
    },
  })

  return new Response(body, { status: 200, headers: STREAM_HEADERS })
}

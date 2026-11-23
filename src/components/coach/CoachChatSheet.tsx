import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { CHAT_INPUT_MAX, chatThreadKey, mentionsPain, quickQuestions, type QuickQuestion } from '../../domain/coachChat'
import { db } from '../../db/db'
import { askCoach, clearChatThread, listChatThread } from '../../db/coachChat'
import { AiRequestError, streamCoachChat } from '../../lib/aiClient'
import { useCoachChatUi } from '../../store/coachChatUi'
import { useVisualViewport } from '../hooks/useVisualViewport'
import { ChatMarkdown } from './ChatMarkdown'

/** Chat del coach a pantalla completa (se descarga solo al abrirlo). */
export default function CoachChatSheet() {
  const chat = useCoachChatUi((s) => s.chat)
  const closeChat = useCoachChatUi((s) => s.closeChat)
  const viewport = useVisualViewport()

  // Sin scroll de la página de debajo mientras el chat está abierto
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  if (!chat) return null
  return createPortal(
    <motion.div
      className="fixed inset-x-0 z-50 flex flex-col bg-bg pt-safe pl-safe pr-safe"
      style={{ top: viewport.top, height: viewport.height }}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
      role="dialog"
      aria-label="Coach"
    >
      <Chat key={chat.exerciseId ?? ''} exerciseId={chat.exerciseId} onClose={closeChat} keyboardOpen={viewport.height < window.innerHeight - 120} />
    </motion.div>,
    document.body,
  )
}

function Chat({ exerciseId, onClose, keyboardOpen }: { exerciseId: string | null; onClose: () => void; keyboardOpen: boolean }) {
  const threadKey = chatThreadKey(exerciseId)
  const messages = useLiveQuery(() => listChatThread(threadKey), [threadKey])
  const exercise = useLiveQuery(async () => (exerciseId ? ((await db.exercises.get(exerciseId)) ?? null) : null), [exerciseId])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stopRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const busy = streaming !== null

  // Siempre al final: mensajes nuevos y texto que va llegando
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages?.length, streaming, error, keyboardOpen])

  // Al cerrar a mitad de respuesta, deja de pedirla
  useEffect(() => () => stopRef.current?.abort(), [])

  if (messages === undefined || exercise === undefined) return null
  const title = exercise ? exercise.name : 'Tu rutina'
  const questions = quickQuestions(exercise ?? undefined)
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const pendingRetry = !busy && messages.at(-1)?.role === 'user'

  async function send(question?: string) {
    if (busy) return
    const ctrl = new AbortController()
    stopRef.current = ctrl
    setError(null)
    setStreaming('')
    if (question) setInput('')
    try {
      await askCoach({
        threadKey,
        exerciseId,
        question,
        now: Date.now,
        request: (body) => streamCoachChat(body, { onText: setStreaming, signal: ctrl.signal }),
      })
    } catch (err) {
      setError(err instanceof AiRequestError ? err.message : 'No se pudo hablar con el coach. Inténtalo de nuevo.')
    } finally {
      stopRef.current = null
      setStreaming(null)
    }
  }

  function quick(q: QuickQuestion) {
    if (q.complete) {
      setInput(q.text)
      inputRef.current?.focus()
    } else void send(q.text)
  }

  async function clear() {
    if (!messages?.length || !window.confirm(`¿Borrar la conversación sobre ${exercise ? exercise.name : 'tu rutina'}?`)) return
    await clearChatThread(threadKey)
    setError(null)
  }

  const canSend = input.trim().length > 0 && !busy

  return (
    <>
      <div className="mx-auto flex w-full max-w-lg items-center gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-accent uppercase">Coach</p>
          <h2 className="truncate text-lg font-semibold">{title}</h2>
        </div>
        {messages.length > 0 && (
          <button type="button" onClick={clear} disabled={busy} className="px-2 py-1 text-sm text-neutral-400 disabled:opacity-40">
            Borrar
          </button>
        )}
        <button type="button" onClick={onClose} className="px-1 font-medium text-accent">
          Cerrar
        </button>
      </div>

      <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto overscroll-contain px-4" aria-live="polite">
        {messages.length === 0 && !busy && (
          <p className="mt-6 text-center text-sm text-neutral-400">
            Pregunta por la técnica, errores comunes o alternativas. El coach conoce {exercise ? 'este ejercicio, ' : ''}tu rutina de la semana y tu nivel.
          </p>
        )}
        <ol className="space-y-3 py-3">
          {messages.map((m) => (
            <li key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
              {m.role === 'user' ? (
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent/90 px-3.5 py-2 whitespace-pre-wrap text-bg">{m.content}</p>
              ) : (
                <div className="max-w-[95%] rounded-2xl rounded-bl-md border border-border bg-surface px-3.5 py-2.5 text-neutral-200">
                  <ChatMarkdown text={m.content} />
                  {m.truncated && <p className="mt-1 text-xs text-neutral-500">Respuesta cortada</p>}
                </div>
              )}
            </li>
          ))}
          {busy && (
            <li>
              <div className="max-w-[95%] rounded-2xl rounded-bl-md border border-border bg-surface px-3.5 py-2.5 text-neutral-200">
                {streaming ? <ChatMarkdown text={streaming} /> : <span className="text-neutral-500">Pensando…</span>}
              </div>
            </li>
          )}
        </ol>
        {lastUser && mentionsPain(lastUser.content) && (
          <p role="note" className="mb-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
            Si notas dolor, para este ejercicio y consulta con un fisioterapeuta o un médico. El coach no puede diagnosticar lesiones.
          </p>
        )}
        {error && (
          <div role="alert" className="mb-3 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-200">
            <p>{error}</p>
            {pendingRetry && (
              <button type="button" onClick={() => send()} className="mt-1 font-semibold text-red-100 underline">
                Reintentar
              </button>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className={`mx-auto w-full max-w-lg border-t border-border px-4 pt-2 ${keyboardOpen ? 'pb-2' : 'pb-[calc(env(safe-area-inset-bottom)+0.5rem)]'}`}>
        <div className="mb-2 flex flex-wrap gap-2">
          {questions.map((q) => (
            <button
              key={q.label}
              type="button"
              disabled={busy}
              onClick={() => quick(q)}
              className="h-9 rounded-full border border-accent/40 px-3 text-sm whitespace-nowrap text-accent disabled:opacity-40"
            >
              {q.label}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSend) void send(input)
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Tecla "Enviar" del teclado (Mayús+Intro = salto de línea)
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                if (canSend) void send(input)
              }
            }}
            maxLength={CHAT_INPUT_MAX}
            rows={1}
            enterKeyHint="send"
            placeholder="Pregunta al coach…"
            aria-label="Pregunta al coach"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 [field-sizing:content]"
          />
          {busy ? (
            <button type="button" onClick={() => stopRef.current?.abort()} className="h-11 shrink-0 rounded-xl border border-border px-4 font-semibold">
              Parar
            </button>
          ) : (
            <button type="submit" disabled={!canSend} className="h-11 shrink-0 rounded-xl bg-accent px-4 font-semibold text-bg disabled:opacity-40">
              Enviar
            </button>
          )}
        </form>
      </div>
    </>
  )
}

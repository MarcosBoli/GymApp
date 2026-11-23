import { useState } from 'react'
import { callAi, AiRequestError, type AiHealth } from '../../lib/aiClient'
import { clearAiSecret, getAiSecret, setAiSecret } from '../../lib/aiSecret'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok' | 'error'; text: string }

/** Secreto para las funciones de IA (x-app-secret), guardado solo en este dispositivo. */
export function AiSettings() {
  const [secret, setSecret] = useState(getAiSecret)
  const [saved, setSaved] = useState(Boolean(getAiSecret()))
  const [visible, setVisible] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (!secret.trim()) return
    setAiSecret(secret)
    setSaved(true)
    setStatus({ kind: 'ok', text: 'Secreto guardado en este dispositivo.' })
  }

  function remove() {
    clearAiSecret()
    setSecret('')
    setSaved(false)
    setStatus({ kind: 'idle' })
  }

  async function test() {
    setStatus({ kind: 'busy' })
    try {
      const h = await callAi<AiHealth>('/api/health')
      setStatus({ kind: 'ok', text: `Conectado. Planes: ${h.models.plan} · Chat: ${h.models.chat}` })
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof AiRequestError ? err.message : 'Error inesperado.' })
    }
  }

  return (
    <form onSubmit={save} className="mx-4 space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div>
        <h2 className="text-lg font-semibold">Asistente IA</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Pega el mismo valor que pusiste en <code className="text-neutral-300">APP_SECRET</code> en Vercel. Se guarda solo en este iPhone y no se incluye en los backups.
        </p>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm text-neutral-400">Secreto de la app</span>
        <span className="flex gap-2">
          <input
            type={visible ? 'text' : 'password'}
            value={secret}
            onChange={(e) => {
              setSecret(e.target.value)
              setSaved(false)
            }}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-bg/60 px-3 font-mono outline-none focus:border-accent/60"
          />
          <button type="button" onClick={() => setVisible(!visible)} className="h-12 rounded-xl bg-white/5 px-3 text-sm text-neutral-300" aria-pressed={visible}>
            {visible ? 'Ocultar' : 'Ver'}
          </button>
        </span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button type="submit" disabled={!secret.trim() || saved} className="h-11 rounded-xl bg-accent font-semibold text-bg disabled:opacity-40">
          {saved ? 'Guardado ✓' : 'Guardar'}
        </button>
        <button type="button" onClick={test} disabled={!saved || status.kind === 'busy'} className="h-11 rounded-xl border border-border font-semibold disabled:opacity-40">
          {status.kind === 'busy' ? 'Probando…' : 'Probar conexión'}
        </button>
      </div>
      {saved && (
        <button type="button" onClick={remove} className="text-sm text-neutral-500 active:text-red-300">
          Borrar secreto de este dispositivo
        </button>
      )}
      {(status.kind === 'ok' || status.kind === 'error') && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${status.kind === 'ok' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
          {status.text}
        </p>
      )}
    </form>
  )
}

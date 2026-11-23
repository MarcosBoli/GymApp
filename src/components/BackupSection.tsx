import { useRef, type ChangeEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { describeLastBackup, parseBackup } from '../domain/backup'
import { backupTableNames, getLastBackupAt, importAll } from '../db/backup'
import { db } from '../db/db'
import { useBackupExport } from './useBackupExport'

const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' })

export function BackupSection() {
  const last = useLiveQuery(async () => ({ at: await getLastBackupAt() }))
  const { status, setStatus, exportNow: handleExport } = useBackupExport()
  const fileInput = useRef<HTMLInputElement>(null)
  const busy = status.kind === 'busy'

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!file) return

    const parsed = parseBackup(await file.text(), {
      tableNames: backupTableNames(),
      currentVersion: db.verno,
    })
    if (!parsed.ok) return setStatus({ kind: 'error', text: parsed.error })

    const exportedAt = dateFormat.format(new Date(parsed.backup.exportedAt))
    const confirmed = window.confirm(
      `Se reemplazarán TODOS los datos de este dispositivo por la copia del ${exportedAt}. ¿Continuar?`,
    )
    if (!confirmed) return

    setStatus({ kind: 'busy' })
    try {
      await importAll(parsed.backup)
      setStatus({ kind: 'ok', text: 'Datos importados correctamente.' })
    } catch {
      setStatus({ kind: 'error', text: 'La copia contiene datos inválidos. No se ha modificado nada.' })
    }
  }

  const lastStatus = last && describeLastBackup(last.at, new Date())

  return (
    <section className="mx-4 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">Copia de seguridad</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Tus datos solo están en este dispositivo. Exporta una copia de vez en cuando.
      </p>

      <div className="mt-4 flex items-baseline justify-between gap-2 text-sm">
        <span className="text-neutral-400">Último backup</span>
        {lastStatus && (
          <span className={lastStatus.stale ? 'font-medium text-amber-400' : 'font-medium text-neutral-100'}>
            {lastStatus.label}
            {last.at !== undefined && (
              <span className="ml-1 font-normal text-neutral-500">· {dateFormat.format(last.at)}</span>
            )}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={busy}
          className="rounded-xl bg-accent px-4 py-3 font-semibold text-bg transition active:scale-[0.98] disabled:opacity-50"
        >
          Exportar
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="rounded-xl border border-border px-4 py-3 font-semibold text-neutral-100 transition active:scale-[0.98] active:bg-white/5 disabled:opacity-50"
        >
          Importar
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImport}
        />
      </div>

      <p className="mt-3 text-xs text-neutral-500">Importar reemplaza todos los datos de este dispositivo.</p>

      {(status.kind === 'ok' || status.kind === 'error') && (
        <p
          role="status"
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            status.kind === 'ok' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
          }`}
        >
          {status.text}
        </p>
      )}
    </section>
  )
}

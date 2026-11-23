import { useLiveQuery } from 'dexie-react-hooks'
import { backupReminder } from '../domain/backup'
import { getLastBackupAt, hasUserData } from '../db/backup'
import { useBackupExport } from './useBackupExport'

/** Consulta compartida: aviso de backup pendiente (Perfil y punto en la pestaña). */
export function useBackupReminder() {
  return useLiveQuery(async () => backupReminder(await getLastBackupAt(), new Date(), await hasUserData()))
}

/** Aviso en Perfil si hay datos sin copia o la última tiene más de 14 días. */
export function BackupReminder() {
  const reminder = useBackupReminder()
  const { status, exportNow } = useBackupExport()
  if (!reminder || status.kind === 'ok') return null
  return (
    <section role="alert" className="mx-4 rounded-2xl border border-amber-400/40 bg-amber-400/[0.06] p-4">
      <h2 className="font-semibold text-amber-200">{reminder.kind === 'never' ? 'Aún no tienes copia de seguridad' : `Último backup hace ${reminder.days} días`}</h2>
      <p className="mt-1 text-sm text-neutral-300">
        Tus datos solo viven en este iPhone. Si borras la app o Safari limpia sus datos, se pierden. Guarda una copia en Archivos o iCloud.
      </p>
      <button
        type="button"
        onClick={exportNow}
        disabled={status.kind === 'busy'}
        className="mt-3 h-11 w-full rounded-xl bg-amber-300 font-semibold text-bg active:scale-[0.98] disabled:opacity-50"
      >
        Exportar ahora
      </button>
      {status.kind === 'error' && <p className="mt-2 text-sm text-red-300">{status.text}</p>}
    </section>
  )
}

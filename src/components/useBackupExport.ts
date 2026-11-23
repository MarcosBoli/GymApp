import { useState } from 'react'
import { backupFileName } from '../domain/backup'
import { exportAll, markBackupDone } from '../db/backup'
import { saveJsonFile } from '../lib/files'

export type ExportStatus = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok' | 'error'; text: string }

/** Exporta todos los datos como JSON y marca la fecha del backup (si no se cancela). */
export function useBackupExport() {
  const [status, setStatus] = useState<ExportStatus>({ kind: 'idle' })
  async function exportNow() {
    setStatus({ kind: 'busy' })
    try {
      const now = new Date()
      const result = await saveJsonFile(backupFileName(now), await exportAll(now))
      if (result === 'cancelled') return setStatus({ kind: 'idle' })
      await markBackupDone(now)
      setStatus({ kind: 'ok', text: 'Copia de seguridad exportada.' })
    } catch {
      setStatus({ kind: 'error', text: 'No se pudo exportar la copia de seguridad.' })
    }
  }
  return { status, setStatus, exportNow }
}

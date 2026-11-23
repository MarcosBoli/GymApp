import { calendarDaysBetween, toDateKey } from './dates'

export const BACKUP_APP_ID = 'gymapp'
/** Pasados estos días sin backup se avisa al usuario. */
export const BACKUP_STALE_DAYS = 14

export type BackupTables = Record<string, Record<string, unknown>[]>

export interface Backup {
  app: typeof BACKUP_APP_ID
  schemaVersion: number
  exportedAt: string
  tables: BackupTables
}

export function createBackup(tables: BackupTables, schemaVersion: number, now: Date): Backup {
  return { app: BACKUP_APP_ID, schemaVersion, exportedAt: now.toISOString(), tables }
}

export function backupFileName(now: Date): string {
  return `gymapp-backup-${toDateKey(now)}.json`
}

export type ParseBackupResult = { ok: true; backup: Backup } | { ok: false; error: string }

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Valida el texto de un archivo de backup.
 * - Ignora tablas desconocidas y trata las que faltan como vacías.
 * - Rechaza backups de una versión de esquema más nueva que la de la app.
 */
export function parseBackup(
  text: string,
  { tableNames, currentVersion }: { tableNames: readonly string[]; currentVersion: number },
): ParseBackupResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'El archivo no es un JSON válido.' }
  }

  if (!isPlainObject(data) || data.app !== BACKUP_APP_ID) {
    return { ok: false, error: 'El archivo no es una copia de seguridad de GymApp.' }
  }

  const { schemaVersion, exportedAt, tables } = data
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return { ok: false, error: 'La copia de seguridad no indica una versión válida.' }
  }
  if (schemaVersion > currentVersion) {
    return {
      ok: false,
      error: 'La copia es de una versión más nueva de la app. Actualiza la app antes de importarla.',
    }
  }
  if (typeof exportedAt !== 'string' || !isPlainObject(tables)) {
    return { ok: false, error: 'La copia de seguridad está incompleta o dañada.' }
  }

  const clean: BackupTables = {}
  for (const name of tableNames) {
    const rows = tables[name]
    if (rows === undefined) {
      clean[name] = []
      continue
    }
    if (!Array.isArray(rows) || !rows.every(isPlainObject)) {
      return { ok: false, error: `La tabla "${name}" de la copia está dañada.` }
    }
    clean[name] = rows
  }

  return { ok: true, backup: { app: BACKUP_APP_ID, schemaVersion, exportedAt, tables: clean } }
}

export interface LastBackupStatus {
  /** "Nunca", "Hoy", "Ayer" o "Hace N días". */
  label: string
  stale: boolean
}

export function describeLastBackup(lastBackupAt: number | undefined, now: Date): LastBackupStatus {
  if (lastBackupAt === undefined) return { label: 'Nunca', stale: true }
  const days = Math.max(0, calendarDaysBetween(new Date(lastBackupAt), now))
  const label = days === 0 ? 'Hoy' : days === 1 ? 'Ayer' : `Hace ${days} días`
  return { label, stale: days > BACKUP_STALE_DAYS }
}

export type BackupReminder = { kind: 'never' } | { kind: 'stale'; days: number } | null

/**
 * Recordatorio en Perfil: si hay datos propios y nunca se ha hecho backup, o si han
 * pasado MÁS de BACKUP_STALE_DAYS días desde el último. Sin datos no se molesta.
 */
export function backupReminder(lastBackupAt: number | undefined, now: Date, hasUserData: boolean): BackupReminder {
  if (!hasUserData) return null
  if (lastBackupAt === undefined) return { kind: 'never' }
  const days = calendarDaysBetween(new Date(lastBackupAt), now)
  return days > BACKUP_STALE_DAYS ? { kind: 'stale', days } : null
}

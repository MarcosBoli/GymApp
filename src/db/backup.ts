import { createBackup, type Backup, type BackupTables } from '../domain/backup'
import { db as defaultDb, seedCatalog, type GymDB } from './db'

export const LAST_BACKUP_KEY = 'lastBackupAt'

export const backupTableNames = (db: GymDB = defaultDb): string[] => db.tables.map((t) => t.name)

/** Lee todas las tablas en una transacción consistente. */
export async function exportAll(now: Date, db: GymDB = defaultDb): Promise<Backup> {
  const tables: BackupTables = {}
  await db.transaction('r', db.tables, async () => {
    for (const table of db.tables) {
      const rows = (await table.toArray()) as Record<string, unknown>[]
      tables[table.name] =
        table.name === 'settings' ? rows.filter((r) => r.key !== LAST_BACKUP_KEY) : rows
    }
  })
  return createBackup(tables, db.verno, now)
}

/**
 * Reemplaza TODOS los datos por los del backup, de forma atómica: si algo falla
 * no se modifica nada. Conserva la fecha del último backup de este dispositivo.
 */
export async function importAll(backup: Backup, db: GymDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.tables, async (tx) => {
    const lastBackup = await db.settings.get(LAST_BACKUP_KEY)
    for (const table of db.tables) {
      await table.clear()
      const rows = backup.tables[table.name] ?? []
      if (rows.length) await table.bulkAdd(rows)
    }
    if (lastBackup) await db.settings.put(lastBackup)
    // Un backup sin catálogo dejaría la app sin músculos/ejercicios
    if ((await db.muscles.count()) === 0) await seedCatalog(tx)
  })
}

export async function markBackupDone(now: Date, db: GymDB = defaultDb): Promise<void> {
  await db.settings.put({ key: LAST_BACKUP_KEY, value: now.getTime() })
}

export async function getLastBackupAt(db: GymDB = defaultDb): Promise<number | undefined> {
  const value = (await db.settings.get(LAST_BACKUP_KEY))?.value
  return typeof value === 'number' ? value : undefined
}

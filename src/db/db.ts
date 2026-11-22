import Dexie, { type EntityTable } from 'dexie'

/** Ajustes clave/valor del usuario (unidades, objetivos, etc.). */
export interface Setting {
  key: string
  value: unknown
}

export const db = new Dexie('gymapp') as Dexie & {
  settings: EntityTable<Setting, 'key'>
}

// Al cambiar el esquema: añadir db.version(n + 1) con su .upgrade(); nunca editar versiones previas.
db.version(1).stores({
  settings: 'key',
})

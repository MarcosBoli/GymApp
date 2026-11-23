import type { ProfileValues } from '../domain/profile'
import { toDateKey } from '../domain/dates'
import { db as defaultDb, type GymDB } from './db'

/** Guarda el perfil y el peso como registro del día. */
export async function saveProfile(values: ProfileValues, now: number, db: GymDB = defaultDb): Promise<void> {
  const { weightKg, ...profile } = values
  await db.transaction('rw', [db.userProfile, db.bodyweightLogs], async () => {
    await db.userProfile.put({ id: 'me', ...profile, updatedAt: now })
    await db.bodyweightLogs.put({ date: toDateKey(new Date(now)), weightKg })
  })
}

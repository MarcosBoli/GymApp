import { describe, expect, it } from 'vitest'
import { backupFileName, createBackup, describeLastBackup, parseBackup } from './backup'

const opts = { tableNames: ['muscles', 'sets'], currentVersion: 2 }
const now = new Date(2026, 10, 22, 18, 30)

describe('createBackup / backupFileName', () => {
  it('incluye app, versión, fecha y tablas', () => {
    const b = createBackup({ sets: [{ id: 'a' }] }, 2, now)
    expect(b).toEqual({ app: 'gymapp', schemaVersion: 2, exportedAt: now.toISOString(), tables: { sets: [{ id: 'a' }] } })
  })

  it('nombra el archivo con el día local', () => {
    expect(backupFileName(now)).toBe('gymapp-backup-2026-11-22.json')
  })
})

describe('parseBackup', () => {
  const valid = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({ ...createBackup({ muscles: [{ id: 'chest' }], sets: [] }, 2, now), ...overrides })

  it('acepta un backup válido (ida y vuelta)', () => {
    const r = parseBackup(valid(), opts)
    expect(r.ok && r.backup.tables).toEqual({ muscles: [{ id: 'chest' }], sets: [] })
  })

  it('acepta versiones anteriores, rellena tablas que faltan e ignora desconocidas', () => {
    const r = parseBackup(valid({ schemaVersion: 1, tables: { muscles: [], extra: [{}] } }), opts)
    expect(r.ok && r.backup.tables).toEqual({ muscles: [], sets: [] })
  })

  it.each([
    ['JSON roto', '{nope', 'JSON válido'],
    ['otra app', JSON.stringify({ app: 'otra' }), 'no es una copia de seguridad de GymApp'],
    ['array', '[]', 'no es una copia de seguridad de GymApp'],
    ['versión más nueva', valid({ schemaVersion: 3 }), 'versión más nueva'],
    ['versión inválida', valid({ schemaVersion: '2' }), 'versión válida'],
    ['sin tablas', valid({ tables: null }), 'incompleta o dañada'],
    ['tabla no array', valid({ tables: { sets: {} } }), 'tabla "sets"'],
    ['fila no objeto', valid({ tables: { sets: [1] } }), 'tabla "sets"'],
  ])('rechaza: %s', (_, text, msg) => {
    const r = parseBackup(text, opts)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain(msg)
  })
})

describe('describeLastBackup', () => {
  it.each([
    [undefined, 'Nunca', true],
    [new Date(2026, 10, 22, 9).getTime(), 'Hoy', false],
    [new Date(2026, 10, 21, 23).getTime(), 'Ayer', false],
    [new Date(2026, 10, 16, 12).getTime(), 'Hace 6 días', false],
    [new Date(2026, 10, 15, 12).getTime(), 'Hace 7 días', true],
  ])('%s → %s', (last, label, stale) => {
    expect(describeLastBackup(last, now)).toEqual({ label, stale })
  })
})

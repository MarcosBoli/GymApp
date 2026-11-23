import { describe, expect, it } from 'vitest'
import { RANK_CONFIG, STRENGTH_STANDARDS } from './ranking'
import { EXERCISES } from './exercises'

describe('strength-standards.json', () => {
  const ids = new Set(EXERCISES.map((e) => e.id))

  it('5 niveles con scores crecientes que terminan en 100', () => {
    expect(STRENGTH_STANDARDS.levels).toHaveLength(5)
    const ls = STRENGTH_STANDARDS.levelScores
    expect(ls).toHaveLength(5)
    for (let i = 1; i < 5; i++) expect(ls[i]!).toBeGreaterThan(ls[i - 1]!)
    expect(ls[0]).toBeGreaterThan(0)
    expect(ls[4]).toBe(100)
  })

  it.each(Object.entries(STRENGTH_STANDARDS.exercises))('%s: ejercicio existente y umbrales estrictamente crecientes', (id, std) => {
    expect(ids.has(id)).toBe(true)
    for (const sex of ['male', 'female'] as const) {
      const t = std[sex]
      expect(t).toHaveLength(5)
      expect(t[0]).toBeGreaterThan(0)
      for (let i = 1; i < 5; i++) expect(t[i]!).toBeGreaterThan(t[i - 1]!)
    }
  })

  it('dominadas y fondos suman el peso corporal', () => {
    for (const id of ['pull_up', 'chin_up', 'dips']) {
      expect(STRENGTH_STANDARDS.exercises[id]?.addBodyweight).toBe(true)
    }
    expect(STRENGTH_STANDARDS.exercises.bench_press?.addBodyweight).toBeFalsy()
  })

  it('cubre la mayoría del catálogo', () => {
    expect(Object.keys(STRENGTH_STANDARDS.exercises).length).toBeGreaterThanOrEqual(40)
  })
})

describe('rank-config.json', () => {
  const { tiers } = RANK_CONFIG

  it('6 tiers de Novato a Titán, empezando en 0 y con umbrales crecientes < 100', () => {
    expect(tiers.map((t) => t.id)).toEqual(['novato', 'aprendiz', 'atleta', 'veterano', 'elite', 'titan'])
    expect(tiers.map((t) => t.name)).toEqual(['Novato', 'Aprendiz', 'Atleta', 'Veterano', 'Élite', 'Titán'])
    expect(tiers[0]!.minScore).toBe(0)
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]!.minScore).toBeGreaterThan(tiers[i - 1]!.minScore)
    expect(tiers.at(-1)!.minScore).toBeLessThan(100)
    expect(new Set(tiers.map((t) => t.id)).size).toBe(tiers.length)
  })

  it('umbrales anclados a los niveles de strength-standards (con constancia óptima)', () => {
    const [, novato, intermedio, avanzado] = [0, ...STRENGTH_STANDARDS.levelScores.slice(1, 4)]
    const principiante = STRENGTH_STANDARDS.levelScores[0]
    const { strength, consistency } = RANK_CONFIG.weights
    const muscle = (s: number) => s * strength + 100 * consistency
    const min = Object.fromEntries(tiers.map((t) => [t.id, t.minScore]))
    expect(min.aprendiz).toBeCloseTo(muscle(principiante!))
    expect(min.atleta).toBeCloseTo(muscle(novato!))
    expect(min.veterano).toBeCloseTo(muscle(intermedio!))
    expect(min.elite).toBeCloseTo(muscle((intermedio! + avanzado!) / 2))
    expect(min.titan).toBeCloseTo(muscle(avanzado!))
  })

  it('un color hex distinto por tier (mapa corporal)', () => {
    expect(tiers.every((t) => /^#[0-9a-f]{6}$/i.test(t.color))).toBe(true)
    expect(new Set(tiers.map((t) => t.color.toLowerCase())).size).toBe(tiers.length)
  })

  it('pesos suman 1 y parámetros coherentes', () => {
    expect(RANK_CONFIG.weights.strength + RANK_CONFIG.weights.consistency).toBeCloseTo(1)
    const c = RANK_CONFIG.consistency
    expect(c.optimalMinSets).toBeLessThan(c.optimalMaxSets)
    expect(c.optimalMaxSets).toBeLessThan(c.overreachSets)
    expect(RANK_CONFIG.promotion.winsNeeded).toBeLessThanOrEqual(RANK_CONFIG.promotion.sessions)
    expect(RANK_CONFIG.windows).toEqual({ strengthDays: 42, consistencyDays: 7, inactivityDays: 14 })
  })
})

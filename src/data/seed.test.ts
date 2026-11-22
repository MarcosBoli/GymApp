import { describe, expect, it } from 'vitest'
import { MUSCLES } from './muscles'
import { EXERCISES, buildExerciseCatalog } from './exercises'

describe('catálogo semilla', () => {
  const { exercises, exerciseMuscles } = buildExerciseCatalog()
  const muscleIds = new Set(MUSCLES.map((m) => m.id))

  it('tiene IDs únicos', () => {
    expect(new Set(MUSCLES.map((m) => m.id)).size).toBe(MUSCLES.length)
    expect(new Set(exercises.map((e) => e.id)).size).toBe(exercises.length)
  })

  it('tiene ~40 ejercicios y 15 músculos', () => {
    expect(MUSCLES).toHaveLength(15)
    expect(exercises.length).toBeGreaterThanOrEqual(40)
  })

  it('cada ejercicio tiene al menos un músculo principal y ningún músculo repetido', () => {
    for (const e of EXERCISES) {
      expect(e.primary.length).toBeGreaterThan(0)
      const all = [...e.primary, ...(e.secondary ?? [])]
      expect(new Set(all).size).toBe(all.length)
    }
  })

  it('solo referencia músculos existentes y factores 1 o 0.5', () => {
    for (const em of exerciseMuscles) {
      expect(muscleIds.has(em.muscleId as never)).toBe(true)
      expect([1, 0.5]).toContain(em.factor)
    }
  })

  it('todos los músculos tienen al menos un ejercicio principal', () => {
    const covered = new Set(exerciseMuscles.filter((em) => em.factor === 1).map((em) => em.muscleId))
    for (const m of MUSCLES) expect(covered.has(m.id)).toBe(true)
  })
})

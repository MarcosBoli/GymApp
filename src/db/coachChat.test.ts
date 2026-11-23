import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDb, type GymDB } from './db'
import { addChatMessage, askCoach, clearChatThread, getChatContext, listChatThread } from './coachChat'
import { savePlanVersion } from './plans'
import { saveProfile } from './profile'
import { addSet, finishWorkout, startWorkout } from './workouts'
import { exportAll } from './backup'
import type { ProfileValues } from '../domain/profile'

let n = 0
const opened: GymDB[] = []
const fresh = () => {
  const db = createDb(`chat-${++n}`)
  opened.push(db)
  return db
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete()
})

const MON = new Date(2026, 10, 23, 10).getTime()
const profile: ProfileValues = { sex: 'male', birthDate: '1995-01-01', heightCm: 180, weightKg: 80, activityLevel: 'moderate', goal: 'gain', trainingGoal: 'hypertrophy', daysPerWeek: 4, sessionMinutes: 60, equipment: ['barbell', 'dumbbell'], limitations: '' }

describe('historial por ejercicio', () => {
  it('hilos separados, en orden, y borrar solo uno', async () => {
    const db = fresh()
    await addChatMessage({ threadKey: 'bench_press', role: 'user', content: 'b2' }, MON + 2, db)
    await addChatMessage({ threadKey: 'bench_press', role: 'user', content: 'b1' }, MON + 1, db)
    await addChatMessage({ threadKey: 'back_squat', role: 'user', content: 's1' }, MON, db)
    expect((await listChatThread('bench_press', db)).map((m) => m.content)).toEqual(['b1', 'b2'])
    expect(await clearChatThread('bench_press', db)).toBe(2)
    expect(await listChatThread('bench_press', db)).toEqual([])
    expect(await listChatThread('back_squat', db)).toHaveLength(1)
  })

  it('el historial entra en el backup', async () => {
    const db = fresh()
    await addChatMessage({ threadKey: 'general', role: 'user', content: 'hola' }, MON, db)
    const backup = await exportAll(new Date(MON), db)
    expect(JSON.stringify(backup)).toContain('chatMessages')
  })
})

describe('contexto del chat', () => {
  it('ejercicio con músculos, e1RM y objetivo del plan; rutina con días hechos', async () => {
    const db = fresh()
    await saveProfile(profile, MON - 30 * 86_400_000, db)
    const plan = await savePlanVersion(
      {
        weekStart: '2026-11-23',
        source: 'ai',
        reasoning: 'r',
        days: [
          { dayIndex: 0, name: 'Torso A', exercises: [{ exerciseId: 'bench_press', sets: 4, repsMin: 6, repsMax: 10, rpeTarget: 8, notes: '' }] },
          { dayIndex: 3, name: 'Pierna', exercises: [{ exerciseId: 'back_squat', sets: 4, repsMin: 5, repsMax: 8, rpeTarget: 8, notes: '' }] },
        ],
      },
      MON,
      db,
    )
    const w = await startWorkout(MON, undefined, db, { planId: plan.id, dayIndex: 0 })
    await addSet(w.id, 'bench_press', { weightKg: 80, reps: 8, isWarmup: false }, MON + 1, db)
    await finishWorkout(w.id, MON + 2, db)

    const text = await getChatContext('bench_press', MON + 3, db)
    expect(text).toContain('Usuario: hombre, 31 años, 80 kg, 180 cm.')
    expect(text).toMatch(/Ejercicio consultado: Press de banca.*principales: Pecho/)
    expect(text).toContain('mejor 1RM estimado en este ejercicio (90 días): 101,3 kg')
    expect(text).toMatch(/En su rutina de esta semana: Lunes: 4 × 6-10 @ RPE 8 · \d+(,\d)? kg\./)
    expect(text).toContain('- Lunes · Torso A (hecho): Press de banca')
    expect(text).toContain('- Jueves · Pierna: Sentadilla')

    const general = await getChatContext(null, MON + 3, db)
    expect(general).not.toContain('Ejercicio consultado')
    expect(general).toContain('Rutina de esta semana')
  })
})

describe('askCoach', () => {
  const reply = (text: string) => vi.fn(async () => ({ text, model: 'claude-haiku-5-5', truncated: false }))

  it('guarda pregunta y respuesta y envía historial + contexto', async () => {
    const db = fresh()
    let t = MON
    const request = reply('  Baja controlando.  ')
    const saved = await askCoach({ threadKey: 'bench_press', exerciseId: 'bench_press', question: ' ¿Cómo se hace? ', now: () => ++t, request }, db)
    expect(saved).toMatchObject({ role: 'assistant', content: 'Baja controlando.', model: 'claude-haiku-5-5', truncated: false })
    const [body] = request.mock.calls[0] as unknown as [{ messages: unknown[]; context: string }]
    expect(body.messages).toEqual([{ role: 'user', content: '¿Cómo se hace?' }])
    expect(body.context).toContain('Ejercicio consultado')

    const second = reply('Sí')
    await askCoach({ threadKey: 'bench_press', exerciseId: 'bench_press', question: '¿Y los codos?', now: () => ++t, request: second }, db)
    const [body2] = second.mock.calls[0] as unknown as [{ messages: { role: string }[] }]
    expect(body2.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(await listChatThread('bench_press', db)).toHaveLength(4)
  })

  it('si falla, la pregunta queda y se puede reintentar sin repetirla', async () => {
    const db = fresh()
    let t = MON
    const failing = vi.fn(async () => {
      throw new Error('sin saldo')
    })
    await expect(askCoach({ threadKey: 'general', exerciseId: null, question: 'Hola', now: () => ++t, request: failing }, db)).rejects.toThrow('sin saldo')
    expect((await listChatThread('general', db)).map((m) => m.role)).toEqual(['user'])

    const ok = reply('Hola, ¿qué tal?')
    await askCoach({ threadKey: 'general', exerciseId: null, now: () => ++t, request: ok }, db)
    expect((await listChatThread('general', db)).map((m) => m.content)).toEqual(['Hola', 'Hola, ¿qué tal?'])

    // Ya respondida: reintentar no llama a la IA
    const again = reply('x')
    expect(await askCoach({ threadKey: 'general', exerciseId: null, now: () => ++t, request: again }, db)).toBeNull()
    expect(again).not.toHaveBeenCalled()
  })

  it('respuesta parada a medias: se guarda como truncada; vacía no se guarda', async () => {
    const db = fresh()
    let t = MON
    await askCoach({ threadKey: 'general', exerciseId: null, question: 'a', now: () => ++t, request: async () => ({ text: 'Primero', model: null, truncated: true }) }, db)
    const last = (await listChatThread('general', db)).at(-1)!
    expect(last).toMatchObject({ content: 'Primero', truncated: true })
    expect(last).not.toHaveProperty('model')
    await askCoach({ threadKey: 'general', exerciseId: null, question: 'b', now: () => ++t, request: async () => ({ text: '  ', model: null, truncated: true }) }, db)
    expect((await listChatThread('general', db)).at(-1)!.role).toBe('user')
  })
})

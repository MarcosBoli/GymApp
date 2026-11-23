import { describe, expect, it } from 'vitest'
import type { UserProfile } from './types'
import type { MuscleStatus } from './progress'
import { rankFromScore } from './ranking'
import { CHAT_LIMITS } from './chatStream'
import { buildChatContext, chatRequestMessages, chatThreadKey, GENERAL_THREAD, mentionsPain, quickQuestions, type ChatContextInput } from './coachChat'

const profile: UserProfile = {
  id: 'me',
  sex: 'male',
  birthDate: '1995-05-10',
  heightCm: 180,
  activityLevel: 'moderate',
  goal: 'maintain',
  trainingGoal: 'hypertrophy',
  daysPerWeek: 4,
  sessionMinutes: 60,
  equipment: ['barbell', 'dumbbell'],
  limitations: 'Hombro derecho sensible',
  updatedAt: 0,
} as UserProfile

const status = (name: string, score: number | null): MuscleStatus =>
  ({ muscleId: name.toLowerCase(), name, displayed: score === null ? null : rankFromScore(score), rank: null, score, strengthScore: score, effectiveSets: 0, consistencyScore: 0, inactive: false }) as MuscleStatus

const overview: ChatContextInput['overview'] = {
  global: { score: 40, displayed: rankFromScore(40), trainedMuscles: 2 },
  muscles: [status('Pecho', 45), status('Espalda', 35), status('Gemelos', null)],
  weakLink: status('Espalda', 35),
}

const base: ChatContextInput = { today: '2026-11-23', profile, bodyweightKg: 80, overview }

describe('hilos y preguntas rápidas', () => {
  it('un hilo por ejercicio; el plan usa el general', () => {
    expect(chatThreadKey('bench_press')).toBe('bench_press')
    expect(chatThreadKey(null)).toBe(GENERAL_THREAD)
  })

  it('ejercicio: cómo se hace, dolor (a completar) y alternativa según el material', () => {
    const q = quickQuestions({ equipment: 'machine' })
    expect(q.map((x) => x.label)).toEqual(['¿Cómo se hace?', '¿Qué hago mal si me duele X?', 'Alternativa sin esta máquina'])
    expect(q[1]).toMatchObject({ complete: true, text: '¿Qué hago mal si me duele ' })
    expect(q[0]!.complete).toBeUndefined()
    expect(quickQuestions({ equipment: 'barbell' })[2]!.label).toBe('Alternativa sin barra')
  })

  it('plan: preguntas generales', () => {
    expect(quickQuestions().map((x) => x.label)).toContain('¿Por qué esta rutina?')
  })
})

describe('mentionsPain', () => {
  it.each(['Me duele el hombro al bajar', 'tengo dolor en la rodilla', 'Siento un pinchazo', 'molestias en la muñeca', 'creo que tengo una lesión', 'me duelen las lumbares'])('detecta: %s', (t) => {
    expect(mentionsPain(t)).toBe(true)
  })
  it.each(['¿Cómo se hace?', 'Tengo agujetas', 'estoy cansado', 'Alternativa sin barra'])('no detecta: %s', (t) => {
    expect(mentionsPain(t)).toBe(false)
  })
})

describe('chatRequestMessages', () => {
  const u = (content: string) => ({ role: 'user' as const, content })
  const a = (content: string) => ({ role: 'assistant' as const, content })

  it('todo cabe: igual (recortando espacios y sin vacíos)', () => {
    expect(chatRequestMessages([u(' hola '), a('qué tal'), u(''), u('¿y?')])).toEqual([u('hola'), a('qué tal'), u('¿y?')])
  })

  it('se queda con los más recientes y empieza por el usuario', () => {
    const history = Array.from({ length: 50 }, (_, i) => (i % 2 ? a(`r${i}`) : u(`p${i}`)))
    const out = chatRequestMessages(history)
    expect(out.length).toBeLessThanOrEqual(CHAT_LIMITS.messages)
    expect(out[0]!.role).toBe('user')
    expect(out.at(-1)).toEqual(history.at(-1))
  })

  it('recorta mensajes largos y respeta el total', () => {
    const limits = { ...CHAT_LIMITS, messageChars: 10, totalChars: 25 }
    const out = chatRequestMessages([u('aaaaaaaaaaaaaaa'), a('bbbbbbbbbbbbbbb'), u('ccccccccccccccc')], limits)
    expect(out).toEqual([u('cccccccccc')]) // 'b…' cabría (20) pero el primero tendría que ser del usuario
    expect(out.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(25)
  })
})

describe('buildChatContext', () => {
  const exercise = {
    name: 'Press banca',
    equipment: 'barbell' as const,
    primary: ['Pecho'],
    secondary: ['Tríceps', 'Hombros'],
    bestE1rm: 100,
    planTargets: ['Lunes: 4 × 6-10 @ RPE 8 · 72,5 kg'],
  }
  const plan = {
    days: [
      { dayIndex: 3, name: 'Torso B', done: false, exercises: [{ name: 'Remo con barra', target: '3 × 8-12 @ RPE 8' }] },
      { dayIndex: 0, name: 'Torso A', done: true, exercises: [{ name: 'Press banca', target: '4 × 6-10 @ RPE 8 · 72,5 kg' }] },
    ],
  }

  it('ejercicio + rutina + nivel', () => {
    const text = buildChatContext({ ...base, exercise, plan })
    expect(text).toContain('Hoy: lunes 2026-11-23.')
    expect(text).toContain('Usuario: hombre, 31 años, 80 kg, 180 cm.')
    expect(text).toContain('Objetivo: hipertrofia.')
    expect(text).toContain('Material disponible: barra, mancuernas.')
    expect(text).toContain('Limitaciones que indica: Hombro derecho sensible')
    expect(text).toContain('Nivel: rango global')
    expect(text).toContain('Eslabón débil: Espalda')
    expect(text).toMatch(/Rangos por músculo: Pecho .*, Espalda/)
    expect(text).not.toContain('Gemelos') // sin rango
    expect(text).toContain('Ejercicio consultado: Press banca (material: barra; principales: Pecho; secundarios: Tríceps, Hombros).')
    expect(text).toContain('mejor 1RM estimado en este ejercicio (90 días): 100 kg')
    expect(text).toContain('En su rutina de esta semana: Lunes: 4 × 6-10 @ RPE 8 · 72,5 kg.')
    // Días ordenados y marcados
    expect(text.indexOf('- Lunes · Torso A (hecho)')).toBeLessThan(text.indexOf('- Jueves · Torso B: Remo con barra 3 × 8-12 @ RPE 8'))
  })

  it('músculos del ejercicio primero en los rangos', () => {
    const text = buildChatContext({ ...base, exercise: { ...exercise, primary: ['Espalda'], secondary: [] } })
    expect(text).toMatch(/Rangos por músculo: Espalda .*, Pecho/)
  })

  it('sin plan, sin series, sin perfil', () => {
    const text = buildChatContext({ today: '2026-11-29', overview: { global: { score: null, displayed: null, trainedMuscles: 0 }, muscles: [], weakLink: null }, exercise: { ...exercise, bestE1rm: null, planTargets: [] } })
    expect(text).toContain('Hoy: domingo')
    expect(text).toContain('Usuario: perfil sin completar.')
    expect(text).toContain('aún sin rango global')
    expect(text).toContain('Aún no tiene series registradas en este ejercicio.')
    expect(text).toContain('Rutina de esta semana: no tiene.')
    expect(text).not.toContain('En su rutina')
  })

  it('peso corporal: e1RM incluye el peso del cuerpo', () => {
    expect(buildChatContext({ ...base, exercise: { ...exercise, equipment: 'bodyweight' } })).toContain('(peso corporal + lastre)')
  })

  it('respeta el tamaño máximo', () => {
    const long = { days: [{ dayIndex: 0, name: 'X', done: false, exercises: Array.from({ length: 500 }, () => ({ name: 'Ejercicio largo', target: '3 × 8-12 @ RPE 8' })) }] }
    const text = buildChatContext({ ...base, plan: long }, 2000)
    expect(text.length).toBe(2000)
    expect(text.endsWith('…')).toBe(true)
  })
})

/**
 * Chat del coach: hilo por ejercicio, preguntas rápidas, recorte del historial a los
 * límites de /api/chat y contexto compacto (ejercicio, rutina de la semana y nivel).
 * Todo puro.
 */
import type { DateKey, Equipment, UserProfile } from './types'
import type { RankOverview } from './progress'
import { CHAT_LIMITS } from './chatStream'
import { formatRank } from './ranking'
import { ageOn } from './energy'
import { weekdayIndex } from './dates'
import { formatDecimal } from './number'
import { DAY_NAMES } from './plan'
import { EQUIPMENT_LABELS, TRAINING_GOAL_LABELS } from './profile'

/** Hilo del chat abierto desde el plan (sin ejercicio concreto). */
export const GENERAL_THREAD = 'general'
export const chatThreadKey = (exerciseId: string | null) => exerciseId ?? GENERAL_THREAD

/** Longitud máxima de una pregunta escrita en la app. */
export const CHAT_INPUT_MAX = 1000

export interface QuickQuestion {
  label: string
  /** Texto que se envía (o se deja en el campo si `complete`). */
  text: string
  /** true: se pone en el campo para que el usuario lo complete (p. ej. dónde le duele). */
  complete?: boolean
}

const PAIN_QUESTION: QuickQuestion = { label: '¿Qué hago mal si me duele X?', text: '¿Qué hago mal si me duele ', complete: true }

const ALTERNATIVE_LABEL: Record<Equipment, string> = {
  machine: 'Alternativa sin esta máquina',
  cable: 'Alternativa sin esta polea',
  barbell: 'Alternativa sin barra',
  dumbbell: 'Alternativa sin mancuernas',
  bodyweight: 'Alternativa más fácil o más difícil',
  other: 'Alternativa con otro material',
}

/** Preguntas sugeridas: del ejercicio (técnica, dolor, alternativa según su material) o del plan. */
export function quickQuestions(exercise?: { equipment: Equipment }): QuickQuestion[] {
  if (!exercise) {
    return [
      { label: '¿Por qué esta rutina?', text: '¿Por qué esta rutina? Explícame la lógica de la semana.' },
      PAIN_QUESTION,
      { label: 'Alternativa sin una máquina', text: 'Si una máquina de la rutina está ocupada o no la tengo, ¿por qué la cambio?' },
    ]
  }
  const alternative = ALTERNATIVE_LABEL[exercise.equipment]
  return [
    { label: '¿Cómo se hace?', text: '¿Cómo se hace? Explícame la técnica paso a paso.' },
    PAIN_QUESTION,
    { label: alternative, text: `${alternative}: ¿qué hago en su lugar con mi material?` },
  ]
}

/**
 * ¿Habla de dolor o lesión? La app muestra entonces un aviso fijo (además de lo que diga la IA).
 * No cuenta las agujetas ni el cansancio.
 */
export function mentionsPain(text: string): boolean {
  return /\b(dolor(es)?|duel[ea]n?|dolid[oa]|me dol[ií]a|molestias?|lesi[oó]n|lesionad[oa]|pinchazo|punzante|tir[oó]n|hormigueo|crujid[oa]|se me sube el dolor)\b/i.test(text)
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Historial a enviar: los mensajes más recientes que caben en los límites de /api/chat
 * (número, longitud por mensaje y total), empezando siempre por un mensaje del usuario.
 */
export function chatRequestMessages(
  history: readonly ChatTurn[],
  limits: { messages: number; messageChars: number; totalChars: number } = CHAT_LIMITS,
): ChatTurn[] {
  const picked: ChatTurn[] = []
  let total = 0
  for (let i = history.length - 1; i >= 0 && picked.length < limits.messages; i--) {
    const content = history[i]!.content.trim().slice(0, limits.messageChars)
    if (!content) continue
    if (total + content.length > limits.totalChars) break
    total += content.length
    picked.push({ role: history[i]!.role, content })
  }
  picked.reverse()
  while (picked.length && picked[0]!.role !== 'user') picked.shift()
  return picked
}

// ─── Contexto ──────────────────────────────────────────────────────────────

export interface ChatExerciseInfo {
  name: string
  equipment: Equipment
  primary: string[]
  secondary: string[]
  /** Mejor e1RM de los últimos 90 días (kg), si lo hay. */
  bestE1rm?: number | null
  /** Objetivos en la rutina de la semana, ya formateados ("Lunes: 4 × 6-10 @ RPE 8 · 72,5 kg"). */
  planTargets: string[]
}

export interface ChatPlanDay {
  dayIndex: number
  name: string
  done: boolean
  exercises: { name: string; target: string }[]
}

export interface ChatContextInput {
  today: DateKey
  profile?: UserProfile
  bodyweightKg?: number
  overview: Pick<RankOverview, 'global' | 'muscles' | 'weakLink'>
  exercise?: ChatExerciseInfo
  /** Rutina vigente de la semana; undefined si no hay. */
  plan?: { days: ChatPlanDay[] }
}

const EQUIPMENT_NAME: Record<Equipment, string> = {
  barbell: 'barra',
  dumbbell: 'mancuernas',
  machine: 'máquina',
  cable: 'polea',
  bodyweight: 'peso corporal',
  other: 'otro',
}

function userLine(profile: UserProfile | undefined, bodyweightKg: number | undefined, today: DateKey): string {
  if (!profile) return bodyweightKg ? `Usuario: ${formatDecimal(bodyweightKg, 1)} kg (perfil sin completar).` : 'Usuario: perfil sin completar.'
  const parts = [profile.sex === 'female' ? 'mujer' : 'hombre', `${ageOn(profile.birthDate, today)} años`]
  if (bodyweightKg) parts.push(`${formatDecimal(bodyweightKg, 1)} kg`)
  parts.push(`${profile.heightCm} cm`)
  const extra: string[] = []
  if (profile.trainingGoal) extra.push(`Objetivo: ${TRAINING_GOAL_LABELS[profile.trainingGoal].toLowerCase()}.`)
  if (profile.equipment?.length) extra.push(`Material disponible: ${profile.equipment.map((e) => EQUIPMENT_LABELS[e].toLowerCase()).join(', ')}.`)
  if (profile.daysPerWeek && profile.sessionMinutes) extra.push(`Entrena ${profile.daysPerWeek} días/semana, ${profile.sessionMinutes} min por sesión.`)
  if (profile.limitations?.trim()) extra.push(`Limitaciones que indica: ${profile.limitations.trim()}`)
  return [`Usuario: ${parts.join(', ')}.`, ...extra].join(' ')
}

function levelLines(overview: ChatContextInput['overview'], focus: readonly string[]): string[] {
  const g = overview.global
  const lines = [g.displayed ? `Nivel: rango global ${formatRank(g.displayed)} (${g.trainedMuscles} músculos con rango).` : 'Nivel: aún sin rango global (pocos datos).']
  if (overview.weakLink?.displayed) lines.push(`Eslabón débil: ${overview.weakLink.name} (${formatRank(overview.weakLink.displayed)}).`)
  const ranked = overview.muscles.filter((m) => m.displayed)
  // Primero los músculos del ejercicio consultado
  const order = [...ranked].sort((a, b) => Number(focus.includes(b.name)) - Number(focus.includes(a.name)))
  if (order.length) lines.push(`Rangos por músculo: ${order.map((m) => `${m.name} ${formatRank(m.displayed!)}`).join(', ')}.`)
  return lines
}

function exerciseLines(e: ChatExerciseInfo): string[] {
  const muscles = [`principales: ${e.primary.join(', ') || '—'}`]
  if (e.secondary.length) muscles.push(`secundarios: ${e.secondary.join(', ')}`)
  const lines = [`Ejercicio consultado: ${e.name} (material: ${EQUIPMENT_NAME[e.equipment]}; ${muscles.join('; ')}).`]
  if (e.bestE1rm) lines.push(`Su mejor 1RM estimado en este ejercicio (90 días): ${formatDecimal(e.bestE1rm, 1)} kg${e.equipment === 'bodyweight' ? ' (peso corporal + lastre)' : ''}.`)
  else lines.push('Aún no tiene series registradas en este ejercicio.')
  if (e.planTargets.length) lines.push(`En su rutina de esta semana: ${e.planTargets.join('; ')}.`)
  return lines
}

function planLines(plan: ChatContextInput['plan']): string[] {
  if (!plan) return ['Rutina de esta semana: no tiene.']
  return [
    'Rutina de esta semana (series × reps @ RPE · peso que calcula la app; en peso corporal, el peso es lastre):',
    ...[...plan.days]
      .sort((a, b) => a.dayIndex - b.dayIndex)
      .map((d) => `- ${DAY_NAMES[d.dayIndex]} · ${d.name}${d.done ? ' (hecho)' : ''}: ${d.exercises.map((x) => `${x.name} ${x.target}`).join('; ')}`),
  ]
}

/** Texto de contexto para /api/chat, dentro del límite de tamaño. */
export function buildChatContext(input: ChatContextInput, maxChars: number = CHAT_LIMITS.contextChars): string {
  const lines = [
    `Hoy: ${DAY_NAMES[weekdayIndex(input.today)]!.toLowerCase()} ${input.today}.`,
    userLine(input.profile, input.bodyweightKg, input.today),
    ...levelLines(input.overview, input.exercise ? [...input.exercise.primary, ...input.exercise.secondary] : []),
    ...(input.exercise ? exerciseLines(input.exercise) : []),
    ...planLines(input.plan),
  ]
  const text = lines.join('\n')
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`
}

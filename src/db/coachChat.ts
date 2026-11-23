import Dexie from 'dexie'
import type { ChatMessage, DateKey } from '../domain/types'
import { buildChatContext, chatRequestMessages, type ChatPlanDay, type ChatTurn } from '../domain/coachChat'
import { completedDayIndexes, DAY_NAMES, formatPlanTarget, suggestWeight } from '../domain/plan'
import { buildRankOverview } from '../domain/progress'
import { startOfWeek, toDateKey } from '../domain/dates'
import { db as defaultDb, type GymDB } from './db'
import { newId } from './ids'
import { getRankingInputs } from './rankings'
import { getActivePlan, getWeekWorkouts } from './plans'
import { getRecentE1RMs } from './planGeneration'
import { getBodyweightAt, getCatalog } from './workouts'

/** Mensajes de un hilo, del más antiguo al más reciente. */
export function listChatThread(threadKey: string, db: GymDB = defaultDb): Promise<ChatMessage[]> {
  return db.chatMessages.where('[threadKey+createdAt]').between([threadKey, Dexie.minKey], [threadKey, Dexie.maxKey]).toArray()
}

export async function addChatMessage(message: Omit<ChatMessage, 'id' | 'createdAt'>, now: number, db: GymDB = defaultDb): Promise<ChatMessage> {
  const row: ChatMessage = { ...message, id: newId(), createdAt: now }
  await db.chatMessages.add(row)
  return row
}

/** Borra el historial de un hilo. Devuelve cuántos mensajes se borraron. */
export function clearChatThread(threadKey: string, db: GymDB = defaultDb): Promise<number> {
  return db.chatMessages.where('[threadKey+createdAt]').between([threadKey, Dexie.minKey], [threadKey, Dexie.maxKey]).delete()
}

/** Contexto para /api/chat: ejercicio (si lo hay), rutina de la semana con pesos y nivel del usuario. */
export async function getChatContext(exerciseId: string | null, now: number, db: GymDB = defaultDb): Promise<string> {
  const today: DateKey = toDateKey(new Date(now))
  const weekStart = startOfWeek(today)
  const [rank, catalog, profile, bodyweightKg, plan, workouts] = await Promise.all([
    getRankingInputs(now, db),
    getCatalog(db),
    db.userProfile.get('me'),
    getBodyweightAt(now, db),
    getActivePlan(weekStart, db),
    getWeekWorkouts(weekStart, db),
  ])
  const ids = [...(plan?.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)) ?? []), ...(exerciseId ? [exerciseId] : [])]
  const e1rms = await getRecentE1RMs(ids, now, bodyweightKg, db)
  const equipmentOf = (id: string) => catalog.exerciseById.get(id)?.equipment ?? 'other'

  const done = plan ? completedDayIndexes(plan, workouts) : new Set<number>()
  const days: ChatPlanDay[] =
    plan?.days.map((d) => ({
      dayIndex: d.dayIndex,
      name: d.name,
      done: done.has(d.dayIndex),
      exercises: d.exercises.map((e) => ({
        name: catalog.exerciseById.get(e.exerciseId)?.name ?? e.exerciseId,
        target: formatPlanTarget(e, suggestWeight(e1rms.get(e.exerciseId), e, equipmentOf(e.exerciseId), bodyweightKg)),
      })),
    })) ?? []

  const exercise = exerciseId ? catalog.exerciseById.get(exerciseId) : undefined
  const musclesOf = (factor: 1 | 0.5) =>
    exercise
      ? catalog.exerciseMuscles.filter((em) => em.exerciseId === exercise.id && em.factor === factor).map((em) => catalog.muscleById.get(em.muscleId)?.name ?? em.muscleId)
      : []

  return buildChatContext({
    today,
    profile,
    bodyweightKg,
    overview: buildRankOverview(rank),
    plan: plan ? { days } : undefined,
    exercise: exercise && {
      name: exercise.name,
      equipment: exercise.equipment,
      primary: musclesOf(1),
      secondary: musclesOf(0.5),
      bestE1rm: e1rms.get(exercise.id) ?? null,
      planTargets: (plan?.days ?? []).flatMap((d) =>
        d.exercises
          .filter((e) => e.exerciseId === exercise.id)
          .map((e) => `${DAY_NAMES[d.dayIndex]}: ${formatPlanTarget(e, suggestWeight(e1rms.get(e.exerciseId), e, exercise.equipment, bodyweightKg))}`),
      ),
    },
  })
}

export interface CoachReply {
  text: string
  model: string | null
  truncated: boolean
}

export type RequestCoachReply = (body: { messages: ChatTurn[]; context: string }) => Promise<CoachReply>

/**
 * Pregunta al coach: guarda la pregunta (si la hay), envía el historial reciente del hilo
 * con el contexto y guarda la respuesta. Sin `question` reintenta la última pregunta sin
 * respuesta. Si la petición falla, la pregunta queda guardada (para reintentar) y se relanza el error.
 */
export async function askCoach(
  opts: { threadKey: string; exerciseId: string | null; question?: string; now: () => number; request: RequestCoachReply },
  db: GymDB = defaultDb,
): Promise<ChatMessage | null> {
  const question = opts.question?.trim()
  if (question) await addChatMessage({ threadKey: opts.threadKey, role: 'user', content: question }, opts.now(), db)
  const history = await listChatThread(opts.threadKey, db)
  if (history.at(-1)?.role !== 'user') return null
  const [messages, context] = [chatRequestMessages(history), await getChatContext(opts.exerciseId, opts.now(), db)]
  const reply = await opts.request({ messages, context })
  const text = reply.text.trim()
  if (!text) return null
  return addChatMessage(
    { threadKey: opts.threadKey, role: 'assistant', content: text, truncated: reply.truncated, ...(reply.model ? { model: reply.model } : {}) },
    opts.now(),
    db,
  )
}

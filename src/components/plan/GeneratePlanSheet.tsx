import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import type { PlanOutput, PlanRequest, WeekRating as Rating } from '../../domain/planSchema'
import { weekToRate } from '../../domain/plan'
import { trainingPrefs } from '../../domain/coachContext'
import { addDays } from '../../domain/dates'
import { db } from '../../db/db'
import { getActivePlan, listWeekFeedback, saveWeekFeedback, weekHadActivity } from '../../db/plans'
import { generateWeekPlan, MissingTrainingPrefsError } from '../../db/planGeneration'
import { AiRequestError, callAi } from '../../lib/aiClient'
import { getAiSecret } from '../../lib/aiSecret'
import { usePlanUi } from '../../store/planUi'
import { Sheet } from '../Sheet'
import { WeekRating } from './WeekRating'
import { currentWeekStart, todayKey } from './weekDates'

type Step = { kind: 'ready' } | { kind: 'generating' } | { kind: 'error'; message: string }

const requestPlan = (body: PlanRequest) => callAi<{ plan: PlanOutput; model: string }>('/api/plan', body)

/** Generar o regenerar la rutina de la semana actual. */
export default function GeneratePlanSheet() {
  const { generatorOpen, closeGenerator } = usePlanUi()
  return (
    <Sheet open={generatorOpen} title="Rutina con IA" onClose={closeGenerator}>
      {generatorOpen && <Body onDone={closeGenerator} />}
    </Sheet>
  )
}

function Body({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const weekStart = currentWeekStart()
  const [step, setStep] = useState<Step>({ kind: 'ready' })
  const [skippedRating, setSkippedRating] = useState(false)
  const info = useLiveQuery(async () => {
    const [profile, existing, feedback, hadActivity] = await Promise.all([
      db.userProfile.get('me'),
      getActivePlan(weekStart),
      listWeekFeedback(),
      weekHadActivity(addDays(weekStart, -7)),
    ])
    return {
      prefsOk: trainingPrefs(profile) !== null,
      existing,
      rateWeek: weekToRate({ today: todayKey(), currentWeekStart: weekStart, feedback, generating: true, previousWeekHadActivity: hadActivity }),
    }
  }, [weekStart])

  if (!info) return null
  const secretOk = Boolean(getAiSecret())

  async function generate() {
    setStep({ kind: 'generating' })
    try {
      await generateWeekPlan(weekStart, Date.now(), requestPlan)
      onDone()
      navigate('/entrenar/plan')
    } catch (err) {
      const message =
        err instanceof AiRequestError || err instanceof MissingTrainingPrefsError ? err.message : 'No se pudo generar la rutina. Inténtalo de nuevo.'
      setStep({ kind: 'error', message })
    }
  }

  async function rate(r: Rating) {
    if (info?.rateWeek) await saveWeekFeedback(info.rateWeek, r, Date.now())
  }

  if (!info.prefsOk || !secretOk) {
    return (
      <div className="space-y-3 text-zinc-300">
        <p>Para que la IA diseñe tu semana necesita:</p>
        <ul className="list-inside list-disc space-y-1 text-sm">
          {!info.prefsOk && <li>Tu objetivo, días por semana, minutos por sesión y material (Perfil › Entrenamiento).</li>}
          {!secretOk && <li>El secreto de la app (Perfil › Asistente IA).</li>}
        </ul>
        <Link to="/perfil" onClick={onDone} className="block h-12 rounded-xl bg-accent text-center leading-[3rem] font-semibold text-bg">
          Ir a Perfil
        </Link>
      </div>
    )
  }

  if (info.rateWeek && !skippedRating && step.kind === 'ready') {
    return (
      <div className="space-y-4">
        <WeekRating title="Antes de nada: ¿cómo fue la semana pasada?" onRate={rate} onSkip={() => setSkippedRating(true)} />
        <p className="text-sm text-zinc-500">La IA lo tiene en cuenta para ajustar el volumen y la intensidad.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {step.kind === 'generating' ? (
        <div className="py-10 text-center" role="status">
          <div aria-hidden className="mx-auto size-10 animate-spin rounded-full border-4 border-accent/30 border-t-accent" />
          <p className="mt-4 font-medium">Diseñando tu semana…</p>
          <p className="mt-1 text-sm text-zinc-500">Puede tardar hasta un minuto. No cierres la app.</p>
        </div>
      ) : (
        <>
          <p className="text-zinc-300">
            {info.existing
              ? 'Se generará una versión nueva de la rutina de esta semana. La actual quedará en el historial.'
              : 'La IA diseñará tu semana con tus rangos, tu eslabón débil, tu material y tus limitaciones. Los pesos los calcula la app con tus marcas.'}
          </p>
          {step.kind === 'error' && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{step.message}</p>}
          <button type="button" onClick={generate} className="h-14 w-full rounded-2xl bg-accent text-lg font-bold text-bg active:scale-[0.98]">
            {step.kind === 'error' ? 'Reintentar' : info.existing ? 'Regenerar rutina' : 'Generar rutina'}
          </button>
        </>
      )}
    </div>
  )
}

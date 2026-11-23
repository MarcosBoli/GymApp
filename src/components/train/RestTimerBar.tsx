import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { formatClock, restPhase, restProgress, restRemainingMs, shouldBeep } from '../../domain/restTimer'
import { useRestTimer } from '../../store/restTimer'
import { useNow } from '../hooks/useNow'
import { playBeep, unlockAudio } from '../../lib/sound'

/** Barra de descanso global (sobre la tab bar). El tiempo sale de endsAt - ahora. */
export function RestTimerBar() {
  const { endsAt, durationMs, beepedFor, adjust, stop, markBeeped } = useRestTimer()
  const now = useNow(250, endsAt !== undefined)
  const phase = restPhase(endsAt, now)

  useEffect(() => {
    if (endsAt !== undefined && shouldBeep(endsAt, now, beepedFor)) {
      playBeep()
      markBeeped(endsAt)
    }
  }, [endsAt, now, beepedFor, markBeeped])

  return (
    <AnimatePresence>
      {phase !== 'idle' && endsAt !== undefined && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          className="fixed inset-x-0 z-30 px-3 pl-safe pr-safe"
          style={{ bottom: 'calc(var(--spacing-tabbar) + env(safe-area-inset-bottom) + 0.5rem)' }}
          role="timer"
          aria-live="polite"
        >
          <div className="relative mx-auto max-w-lg overflow-hidden rounded-2xl border border-border bg-surface/95 shadow-2xl backdrop-blur-xl">
            <div
              className={`absolute inset-y-0 left-0 ${phase === 'done' ? 'bg-emerald-500/20' : 'bg-accent/15'}`}
              style={{ width: `${restProgress(endsAt, durationMs, now) * 100}%` }}
            />
            <div className="relative flex items-center gap-2 p-2">
              {phase === 'running' ? (
                <>
                  <TimerButton onClick={() => (unlockAudio(), adjust(Date.now(), -15))}>−15</TimerButton>
                  <div className="flex-1 text-center">
                    <div className="text-xs text-neutral-400">Descanso</div>
                    <div className="text-3xl font-bold tabular-nums">{formatClock(restRemainingMs(endsAt, now), 'ceil')}</div>
                  </div>
                  <TimerButton onClick={() => (unlockAudio(), adjust(Date.now(), 15))}>+15</TimerButton>
                  <TimerButton onClick={stop}>Saltar</TimerButton>
                </>
              ) : (
                <>
                  <div className="flex-1 px-2 text-lg font-semibold text-emerald-300">¡Descanso terminado!</div>
                  <TimerButton onClick={stop}>OK</TimerButton>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function TimerButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className="h-12 min-w-14 rounded-xl bg-white/5 px-3 font-semibold active:bg-white/10">
      {children}
    </button>
  )
}

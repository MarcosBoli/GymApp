import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router'
import { animate, motion, useMotionValue, useReducedMotion, useTransform, useVelocity } from 'framer-motion'
import { TABS } from './tabs'
import { useBackupReminder } from '../BackupReminder'
import { activeTabIndex, indicatorStretch } from '../../domain/navigation'

const PATHS = TABS.map((t) => t.path)
/** Muelle del indicador: rápido y con un rebote mínimo. */
const SPRING = { type: 'spring', bounce: 0.22, duration: 0.5 } as const

export function BottomTabBar() {
  const backupDue = useBackupReminder() != null
  const { pathname } = useLocation()
  const index = activeTabIndex(PATHS, pathname)
  const reduced = useReducedMotion() ?? false

  // El indicador se mueve por índice con translateX (no layoutId): la barra es fixed y una
  // animación de layout medida con el scroll de la página lo hacía bajar y saltar.
  const pos = useMotionValue(Math.max(0, index))
  const x = useTransform(pos, (p) => `${p * 100}%`)
  const stretch = useTransform(useVelocity(pos), indicatorStretch)
  useEffect(() => {
    if (index < 0) return
    if (reduced) {
      pos.set(index)
      return
    }
    const controls = animate(pos, index, SPRING)
    return () => controls.stop()
  }, [index, reduced, pos])

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/85 pb-safe pl-safe pr-safe backdrop-blur-xl select-none"
    >
      <ul className="relative mx-auto flex h-tabbar max-w-lg items-stretch">
        <motion.li
          aria-hidden
          data-tab-indicator
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{ width: `${100 / TABS.length}%`, x, opacity: index < 0 ? 0 : 1 }}
        >
          <motion.span className="absolute inset-x-2 inset-y-1.5 rounded-2xl border border-accent/15 bg-accent/10" style={{ scaleX: stretch }} />
          <motion.span
            className="absolute top-0 left-1/2 -ml-4 h-[3px] w-8 rounded-full bg-accent shadow-[0_0_12px_rgba(255,69,69,0.65)]"
            style={{ scaleX: stretch }}
          />
        </motion.li>
        {TABS.map(({ path, label, Icon }, i) => {
          const active = i === index
          return (
            <li key={path} className="relative flex-1">
              <NavLink
                to={path}
                end={path === '/'}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-200 ${
                  active ? 'text-accent' : 'text-neutral-500 active:text-neutral-300'
                }`}
              >
                <motion.span className="relative" initial={false} animate={{ y: active ? -1.5 : 0, scale: active ? 1.08 : 1 }} transition={SPRING}>
                  <Icon className="size-6" />
                  {path === '/perfil' && backupDue && (
                    <span className="absolute -top-0.5 -right-1 size-2.5 rounded-full border-2 border-bg bg-amber-400" aria-label="Copia de seguridad pendiente" />
                  )}
                </motion.span>
                <span>{label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

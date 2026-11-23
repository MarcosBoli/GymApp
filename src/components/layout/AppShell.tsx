import { lazy, Suspense } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router'
import { motion } from 'framer-motion'
import { BottomTabBar } from './BottomTabBar'
import { RestTimerBar } from '../train/RestTimerBar'
import { usePlanUi } from '../../store/planUi'

// La hoja de generar rutina solo se descarga cuando se abre
const GeneratePlanSheet = lazy(() => import('../plan/GeneratePlanSheet'))

export function AppShell() {
  const { pathname } = useLocation()
  const generatorOpen = usePlanUi((s) => s.generatorOpen)

  return (
    <div className="min-h-dvh pt-safe pl-safe pr-safe">
      {/* Status bar black-translucent: el contenido que sube no se mezcla con la hora/batería */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-30 h-[env(safe-area-inset-top)] bg-bg/85 backdrop-blur-xl" />
      {/* Cada pestaña recuerda su scroll; las pantallas nuevas empiezan arriba */}
      <ScrollRestoration getKey={(location) => location.pathname} />
      {/* Hueco inferior = altura de la tab bar + home indicator */}
      <main className="mx-auto max-w-lg pb-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+1rem)]">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <Outlet />
        </motion.div>
      </main>
      {generatorOpen && (
        <Suspense fallback={null}>
          <GeneratePlanSheet />
        </Suspense>
      )}
      <RestTimerBar />
      <BottomTabBar />
    </div>
  )
}

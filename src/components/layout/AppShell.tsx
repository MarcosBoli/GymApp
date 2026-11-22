import { Outlet, useLocation } from 'react-router'
import { motion } from 'framer-motion'
import { BottomTabBar } from './BottomTabBar'
import { RestTimerBar } from '../train/RestTimerBar'

export function AppShell() {
  const { pathname } = useLocation()

  return (
    <div className="min-h-dvh pt-safe pl-safe pr-safe">
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
      <RestTimerBar />
      <BottomTabBar />
    </div>
  )
}

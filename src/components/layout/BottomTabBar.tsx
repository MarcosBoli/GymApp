import { NavLink } from 'react-router'
import { motion } from 'framer-motion'
import { TABS } from './tabs'
import { useBackupReminder } from '../BackupReminder'

export function BottomTabBar() {
  const backupDue = useBackupReminder() != null
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/85 pb-safe pl-safe pr-safe backdrop-blur-xl select-none"
    >
      <ul className="mx-auto flex h-tabbar max-w-lg items-stretch">
        {TABS.map(({ path, label, Icon }) => (
          <li key={path} className="flex-1">
            <NavLink
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-accent' : 'text-neutral-500 active:text-neutral-300'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="absolute top-0 h-0.5 w-8 rounded-full bg-accent"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <span className="relative">
                    <Icon className="size-6" />
                    {path === '/perfil' && backupDue && (
                      <span className="absolute -top-0.5 -right-1 size-2.5 rounded-full border-2 border-bg bg-amber-400" aria-label="Copia de seguridad pendiente" />
                    )}
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

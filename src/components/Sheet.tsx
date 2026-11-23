import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

/** Hoja a pantalla completa que sube desde abajo (portal: evita el transform de la página). */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col bg-bg pt-safe pl-safe pr-safe"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 400, damping: 40 }}
          role="dialog"
          aria-label={title}
        >
          <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4 pt-3 pb-2">
            <h2 className="truncate text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="px-1 font-medium text-accent">
              Cerrar
            </button>
          </div>
          <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

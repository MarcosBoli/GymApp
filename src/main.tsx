import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { MotionConfig } from 'framer-motion'
import { registerSW } from 'virtual:pwa-register'
import { router } from './router'
import { requestPersistentStorage } from './db/persist'
import './index.css'

// Service worker con autoUpdate: se actualiza y recarga solo al publicar una versión nueva.
// iOS mantiene la PWA viva en segundo plano: buscar versión nueva cada vez que vuelve a primer plano.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void registration.update()
    })
  },
})

// Si un chunk de una versión anterior ya no existe (tras una actualización), recargar
window.addEventListener('vite:preloadError', () => window.location.reload())

// Pide almacenamiento persistente para que iOS/Safari no purgue IndexedDB
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Respeta "Reducir movimiento" de iOS: sin desplazamientos ni escalados animados */}
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  </StrictMode>,
)

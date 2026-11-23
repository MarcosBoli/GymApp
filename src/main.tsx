import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import { router } from './router'
import { requestPersistentStorage } from './db/persist'
import './index.css'

// Service worker con autoUpdate: se actualiza y recarga solo al publicar una versión nueva
registerSW({ immediate: true })

// Si un chunk de una versión anterior ya no existe (tras una actualización), recargar
window.addEventListener('vite:preloadError', () => window.location.reload())

// Pide almacenamiento persistente para que iOS/Safari no purgue IndexedDB
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import { router } from './router'
import { requestPersistentStorage } from './db/persist'
import './index.css'

// Service worker con autoUpdate: se actualiza y recarga solo al publicar una versión nueva
registerSW({ immediate: true })

// Pide almacenamiento persistente para que iOS/Safari no purgue IndexedDB
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

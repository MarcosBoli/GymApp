import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from './components/layout/AppShell'

/**
 * Cada pestaña se carga bajo demanda (chunk propio). El service worker las precachea
 * todas, así que siguen funcionando offline.
 */
const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default })

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    // Mientras llega el chunk de la primera pantalla: fondo vacío (sin parpadeo blanco)
    HydrateFallback: () => null,
    children: [
      { index: true, lazy: page(() => import('./pages/HomePage')) },
      { path: 'entrenar', lazy: page(() => import('./pages/TrainPage')) },
      { path: 'entrenar/plan', lazy: page(() => import('./pages/PlanPage')) },
      { path: 'entrenar/resumen/:workoutId', lazy: page(() => import('./pages/WorkoutSummaryPage')) },
      { path: 'comida', lazy: page(() => import('./pages/FoodPage')) },
      { path: 'progreso', lazy: page(() => import('./pages/ProgressPage')) },
      { path: 'perfil', lazy: page(() => import('./pages/ProfilePage')) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

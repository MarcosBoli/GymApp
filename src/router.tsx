import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from './components/layout/AppShell'
import HomePage from './pages/HomePage'
import TrainPage from './pages/TrainPage'
import FoodPage from './pages/FoodPage'
import ProgressPage from './pages/ProgressPage'
import ProfilePage from './pages/ProfilePage'
import WorkoutSummaryPage from './pages/WorkoutSummaryPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'entrenar', element: <TrainPage /> },
      { path: 'entrenar/resumen/:workoutId', element: <WorkoutSummaryPage /> },
      { path: 'comida', element: <FoodPage /> },
      { path: 'progreso', element: <ProgressPage /> },
      { path: 'perfil', element: <ProfilePage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

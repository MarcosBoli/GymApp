import type { Muscle } from '../domain/types'

export const MUSCLES = [
  { id: 'chest', name: 'Pecho', group: 'chest', order: 1 },
  { id: 'lats', name: 'Dorsal', group: 'back', order: 2 },
  { id: 'traps', name: 'Trapecio', group: 'back', order: 3 },
  { id: 'lower_back', name: 'Lumbar', group: 'back', order: 4 },
  { id: 'front_delts', name: 'Hombro anterior', group: 'shoulders', order: 5 },
  { id: 'side_delts', name: 'Hombro lateral', group: 'shoulders', order: 6 },
  { id: 'rear_delts', name: 'Hombro posterior', group: 'shoulders', order: 7 },
  { id: 'biceps', name: 'Bíceps', group: 'arms', order: 8 },
  { id: 'triceps', name: 'Tríceps', group: 'arms', order: 9 },
  { id: 'forearms', name: 'Antebrazo', group: 'arms', order: 10 },
  { id: 'abs', name: 'Abdomen', group: 'core', order: 11 },
  { id: 'glutes', name: 'Glúteo', group: 'legs', order: 12 },
  { id: 'quads', name: 'Cuádriceps', group: 'legs', order: 13 },
  { id: 'hamstrings', name: 'Isquiotibiales', group: 'legs', order: 14 },
  { id: 'calves', name: 'Gemelo', group: 'legs', order: 15 },
] as const satisfies readonly Muscle[]

export type MuscleId = (typeof MUSCLES)[number]['id']

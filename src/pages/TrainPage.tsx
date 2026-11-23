import { useLiveQuery } from 'dexie-react-hooks'
import { getActiveWorkout } from '../db/workouts'
import { ActiveWorkout } from '../components/train/ActiveWorkout'
import { StartWorkout } from '../components/train/StartWorkout'

export default function TrainPage() {
  const active = useLiveQuery(async () => ({ workout: await getActiveWorkout() }))
  if (!active) return null
  return active.workout ? <ActiveWorkout workout={active.workout} /> : <StartWorkout />
}

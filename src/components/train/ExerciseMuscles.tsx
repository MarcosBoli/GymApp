import type { ExerciseMuscleNames } from '../../domain/workout'

/** Músculos que entrena un ejercicio: principales resaltados y secundarios atenuados. */
export function ExerciseMuscles({ muscles, className = '' }: { muscles: ExerciseMuscleNames | undefined; className?: string }) {
  if (!muscles || (muscles.primary.length === 0 && muscles.secondary.length === 0)) return null
  return (
    <p className={`text-sm text-neutral-500 ${className}`}>
      {muscles.primary.length > 0 && <span className="text-neutral-300">{muscles.primary.join(', ')}</span>}
      {muscles.primary.length > 0 && muscles.secondary.length > 0 && ' · '}
      {muscles.secondary.length > 0 && <span>{'también\u00a0'}{muscles.secondary.join(', ')}</span>}
    </p>
  )
}

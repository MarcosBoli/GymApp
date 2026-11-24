import { memo, useEffect, useMemo, useRef, type MouseEvent, type PointerEvent } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type AnimationPlaybackControls } from 'framer-motion'
import { BODY_PATHS, type BodyView } from '../../data/bodyMap'
import type { MuscleStatus } from '../../domain/progress'
import { formatRank } from '../../domain/ranking'
import {
  angleForView,
  angleFromDrag,
  degreesPerSecond,
  exceedsSlop,
  flipTarget,
  nearestFace,
  projectAngle,
  releaseVelocity,
  shadeOpacity,
  shadowScaleX,
  viewForAngle,
  type PointerSample,
} from '../../domain/bodyFlip'
import { RANK_CONFIG } from '../../data/ranking'
import { useHomeUi } from '../../store/homeUi'

const UNRANKED = '#2e2828'
/** Muelle del giro: pesado y preciso, con un rebote mínimo. */
const SPRING = { type: 'spring', bounce: 0.12, duration: 0.45 } as const

const fill = (m?: MuscleStatus) => (m?.displayed ? (RANK_CONFIG.tiers[m.displayed.tierIndex]?.color ?? UNRANKED) : UNRANKED)

/** Cara (en Safari de iOS hace falta el prefijo y una capa propia para que backface-visibility no parpadee). */
const FACE_STYLE = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' } as const

interface Gesture {
  pointerId: number
  x0: number
  y0: number
  /** x donde empezó el arrastre (pasado el umbral): el ángulo sale de aquí, sin salto. */
  dragX: number
  base: number
  startFace: number
  width: number
  dragging: boolean
  /** Se cogió la carta a mitad de giro: al soltar sin arrastrar hay que asentarla. */
  caught: boolean
  samples: PointerSample[]
}

/**
 * Silueta delantera/trasera como una carta de dos caras que gira con el dedo (rotateY),
 * con proyección por velocidad y cierre con muelle. Cada músculo es tocable.
 */
export function BodyMap({ muscles }: { muscles: MuscleStatus[] }) {
  const { view, setView, select } = useHomeUi()
  const reduced = useReducedMotion() ?? false
  const angle = useMotionValue(view === 'back' ? 180 : 0)
  const shade = useTransform(angle, shadeOpacity)
  const shadowScale = useTransform(angle, shadowScaleX)
  const controls = useRef<AnimationPlaybackControls | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const suppressClick = useRef(false)

  // Al salir de Inicio a mitad de giro, el muelle no sigue corriendo
  useEffect(() => () => controls.current?.stop(), [])

  // Los trazos (cientos de KB) se generan una vez por cambio de datos, nunca por fotograma
  const front = useMemo(() => <Face side="front" muscles={muscles} onSelect={select} />, [muscles, select])
  const back = useMemo(() => <Face side="back" muscles={muscles} onSelect={select} />, [muscles, select])

  /** Lleva la carta a `target` con el muelle; sin rotación (movimiento reducido) cambia de cara al instante. */
  function settle(target: number, velocity = 0) {
    controls.current?.stop()
    angle.stop()
    if (reduced) {
      angle.set(target)
      setView(viewForAngle(target))
      return
    }
    controls.current = animate(angle, target, { ...SPRING, velocity, onComplete: () => setView(viewForAngle(target)) })
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // Interrumpible: la carta se detiene donde esté y se coge desde ahí
    controls.current?.stop()
    angle.stop()
    const current = angle.get()
    suppressClick.current = false
    gesture.current = {
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      dragX: e.clientX,
      base: current,
      startFace: nearestFace(current),
      width: e.currentTarget.getBoundingClientRect().width,
      dragging: false,
      caught: current !== nearestFace(current),
      samples: [{ t: e.timeStamp, x: e.clientX }],
    }
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    if (!g.dragging) {
      const dx = e.clientX - g.x0
      const dy = e.clientY - g.y0
      if (!exceedsSlop(dx, dy)) return
      // Vertical: es scroll de la página (touch-action: pan-y); el giro no lo toca
      if (Math.abs(dy) > Math.abs(dx)) {
        if (g.caught) settle(g.startFace)
        gesture.current = null
        return
      }
      g.dragging = true
      g.dragX = e.clientX
      suppressClick.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    g.samples.push({ t: e.timeStamp, x: e.clientX })
    if (g.samples.length > 12) g.samples.shift()
    if (!reduced) angle.set(angleFromDrag(g.base, e.clientX - g.dragX, g.width))
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    gesture.current = null
    if (!g.dragging) {
      // Toque: abre el músculo (click). Si se cogió a mitad de giro, solo se asienta.
      if (g.caught) {
        suppressClick.current = true
        settle(flipTarget(g.startFace, angle.get()))
      }
      return
    }
    const velocity = degreesPerSecond(releaseVelocity(g.samples, e.timeStamp), g.width)
    const dragged = angleFromDrag(g.base, e.clientX - g.dragX, g.width)
    settle(flipTarget(g.startFace, projectAngle(dragged, velocity)), velocity)
  }

  function onPointerCancel(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    gesture.current = null
    // El sistema se quedó el gesto (p. ej. scroll): la carta vuelve a una cara
    if (g.dragging || g.caught) settle(flipTarget(g.startFace, angle.get()))
  }

  /** Tras un arrastre no se abre la ficha del músculo donde empezó. */
  function onClickCapture(e: MouseEvent) {
    if (!suppressClick.current) return
    suppressClick.current = false
    e.stopPropagation()
    e.preventDefault()
  }

  const fade = { duration: 0.15, ease: 'easeOut' } as const

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tu cuerpo</h2>
        <div className="flex rounded-lg bg-white/5 p-0.5 text-sm" role="group" aria-label="Vista">
          {(['front', 'back'] as BodyView[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => settle(angleForView(angle.get(), v))}
              className={`rounded-md px-3 py-1.5 font-medium ${view === v ? 'bg-white/10 text-neutral-100' : 'text-neutral-400'}`}
            >
              {v === 'front' ? 'Delante' : 'Detrás'}
            </button>
          ))}
        </div>
      </div>

      <div
        className="relative mx-auto h-[400px] w-[224px] cursor-grab touch-pan-y select-none active:cursor-grabbing"
        style={{ perspective: 1000 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
      >
        {/* Sombra difusa bajo los pies: se estrecha de perfil */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 -bottom-1 h-6 rounded-[50%]"
          style={{ scaleX: shadowScale, background: 'radial-gradient(closest-side, rgba(0,0,0,0.75), rgba(0,0,0,0))' }}
        />

        {/* La carta: un solo transform animado */}
        <motion.div
          className="absolute inset-0"
          style={{ rotateY: reduced ? 0 : angle, transformStyle: 'preserve-3d', willChange: 'transform' }}
        >
          <motion.div
            className="absolute inset-0"
            style={reduced ? undefined : { ...FACE_STYLE, transform: 'translateZ(0)' }}
            initial={false}
            animate={reduced ? { opacity: view === 'front' ? 1 : 0 } : { opacity: 1 }}
            transition={fade}
            inert={view !== 'front'}
            aria-hidden={view !== 'front'}
          >
            {front}
          </motion.div>
          <motion.div
            className="absolute inset-0"
            style={reduced ? undefined : { ...FACE_STYLE, transform: 'rotateY(180deg) translateZ(0)' }}
            initial={false}
            animate={reduced ? { opacity: view === 'back' ? 1 : 0 } : { opacity: 1 }}
            transition={fade}
            inert={view !== 'back'}
            aria-hidden={view !== 'back'}
          >
            {back}
          </motion.div>
        </motion.div>

        {/* Luz: el cuerpo se oscurece de perfil (capa propia, solo cambia su opacidad) */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: shade,
            willChange: 'opacity',
            background: 'radial-gradient(ellipse 60% 55% at 50% 50%, #000 55%, rgba(0,0,0,0) 100%)',
          }}
        />
      </div>
      <p className="mt-1 text-center text-xs text-neutral-500">Desliza para girar · toca un músculo para ver su ficha</p>
    </section>
  )
}

/** Una cara de la carta: silueta y músculos tocables (memoizada: no se repinta al girar). */
const Face = memo(function Face({ side, muscles, onSelect }: { side: BodyView; muscles: MuscleStatus[]; onSelect: (id: string) => void }) {
  const byId = new Map(muscles.map((m) => [m.muscleId, m]))
  const paths = BODY_PATHS[side]
  return (
    <svg viewBox={paths.viewBox} className="h-full w-full" aria-label={side === 'front' ? 'Vista delantera' : 'Vista trasera'}>
      {paths.base.map((d, i) => (
        <path key={`b${i}`} d={d} fill="#26262e" />
      ))}
      {paths.muscles.map(({ muscleId, d: ds }) => {
        const m = byId.get(muscleId)
        const label = `${m?.name ?? muscleId}: ${m?.displayed ? formatRank(m.displayed) : 'sin rango'}${m?.inactive ? ', inactivo' : ''}`
        return (
          <g
            key={muscleId}
            role="button"
            tabIndex={0}
            aria-label={label}
            onClick={() => onSelect(muscleId)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(muscleId)}
            className="cursor-pointer outline-none [&:focus-visible>path]:stroke-white"
          >
            {ds.map((d, i) => (
              <path
                key={i}
                d={d}
                fill={fill(m)}
                fillOpacity={m?.inactive ? 0.45 : 1}
                stroke={m?.inactive ? '#8a8a96' : 'none'}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeDasharray={m?.inactive ? '7 5' : undefined}
              />
            ))}
          </g>
        )
      })}
    </svg>
  )
})

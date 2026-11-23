import { useEffect, useRef } from 'react'
import { animate } from 'framer-motion'

/** "+23 LP" con cuenta animada desde 0. */
export function LpDelta({ value, delay = 0, className = '' }: { value: number; delay?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 0.9,
      delay,
      ease: 'easeOut',
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(Math.round(v))} LP`
      },
    })
    return () => controls.stop()
  }, [value, delay])
  const color = value > 0 ? 'text-emerald-300' : value < 0 ? 'text-red-300' : 'text-neutral-400'
  return <span ref={ref} className={`font-bold tabular-nums ${color} ${className}`}>±0 LP</span>
}

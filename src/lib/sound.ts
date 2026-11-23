/**
 * Aviso sonoro corto con Web Audio. iOS solo permite audio tras un gesto del
 * usuario: llamar a unlockAudio() dentro de un toque (p. ej. al guardar una serie).
 * Nota: en iOS el interruptor de silencio también silencia Web Audio.
 */
let ctx: AudioContext | undefined

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    // Buffer silencioso: desbloquea la salida en versiones antiguas de iOS
    const src = ctx.createBufferSource()
    src.buffer = ctx.createBuffer(1, 1, 22050)
    src.connect(ctx.destination)
    src.start(0)
  } catch {
    // sin Web Audio: no hay sonido
  }
}

/** Dos pitidos cortos. */
export function playBeep(): void {
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
  const t0 = ctx.currentTime
  for (const offset of [0, 0.22]) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, t0 + offset)
    gain.gain.exponentialRampToValueAtTime(0.5, t0 + offset + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.15)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0 + offset)
    osc.stop(t0 + offset + 0.16)
  }
  // Android: vibración si existe (iOS Safari no la soporta)
  navigator.vibrate?.(200)
}

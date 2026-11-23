import { useEffect, useState } from 'react'

/**
 * Alto y desplazamiento del viewport visible. En iOS el teclado no encoge el layout
 * viewport: una pantalla fija con este alto deja el campo de texto justo encima del teclado.
 */
export function useVisualViewport() {
  const read = () => ({ height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 })
  const [box, setBox] = useState(read)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setBox(read())
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return box
}

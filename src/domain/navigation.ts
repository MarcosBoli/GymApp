/**
 * Pestaña activa de la barra inferior para una ruta: "/" solo en Inicio exacto; el resto
 * por prefijo de segmento (/entrenar/plan → Entrenar). −1 si ninguna coincide.
 */
export function activeTabIndex(tabPaths: readonly string[], pathname: string): number {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return tabPaths.findIndex((tab) => (tab === '/' ? path === '/' : path === tab || path.startsWith(`${tab}/`)))
}

/**
 * Estiramiento horizontal del indicador según su velocidad (pestañas por segundo):
 * en reposo 1; al desplazarse se alarga un poco, como un líquido, hasta 1,6.
 */
export const indicatorStretch = (velocity: number): number => 1 + Math.min(Math.abs(velocity) * 0.06, 0.6)

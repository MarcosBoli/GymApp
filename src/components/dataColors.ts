/**
 * Colores de datos validados (dataviz/validate_palette, modo oscuro, superficie #171212).
 * Series únicas (tendencias, e1RM, historial de rangos) en el rojo del tema; macros y balance
 * conservan tonos distintos porque necesitan distinguirse entre sí.
 * Hex y no var(): los atributos de presentación SVG no resuelven variables CSS de forma fiable.
 * Mantener sincronizados con los tokens --color-protein… de src/index.css.
 */
export const DATA_COLORS = {
  protein: '#3987e5',
  carbs: '#d95926',
  fat: '#199e70',
  deficit: '#3987e5',
  surplus: '#e66767',
  /** Peso bruto (puntos): neutro, la tendencia es la serie protagonista. */
  rawWeight: '#a3a3a3',
  /** Anillo de kcal pasado del objetivo: ámbar de aviso (el rojo es el color normal del tema). */
  overTarget: '#f5a524',
  /** Serie protagonista única: el rojo de acento del tema (--color-accent). */
  trend: '#ff4545',
} as const

/**
 * Rampa secuencial roja (un solo tono, ΔL ≥ 0,06 entre pasos, validada con dataviz) para el mapa de calor de volumen.
 * En modo oscuro "poco" se funde con la superficie (paso oscuro) y "mucho" es el paso claro.
 * Índice = tramo de VOLUME_BINS; el 0 (sin series) no lleva color.
 */
export const VOLUME_RAMP = ['transparent', '#86242a', '#b02b33', '#d9434b', '#f08589', '#f9c0c2'] as const
/** Texto legible sobre cada paso de la rampa. */
export const VOLUME_INK = ['#525252', '#ffffff', '#ffffff', '#ffffff', '#0b0b0b', '#0b0b0b'] as const

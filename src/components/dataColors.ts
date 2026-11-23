/**
 * Colores de datos validados (dataviz/validate_palette, modo oscuro, superficie #15151d).
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
  rawWeight: '#a1a1aa',
  trend: '#3987e5',
} as const

/**
 * Rampa secuencial azul (paleta de referencia dataviz) para el mapa de calor de volumen.
 * En modo oscuro "poco" se funde con la superficie (paso oscuro) y "mucho" es el paso claro.
 * Índice = tramo de VOLUME_BINS; el 0 (sin series) no lleva color.
 */
export const VOLUME_RAMP = ['transparent', '#184f95', '#2a78d6', '#5598e7', '#86b6ef', '#b7d3f6'] as const
/** Texto legible sobre cada paso de la rampa. */
export const VOLUME_INK = ['#52525b', '#ffffff', '#ffffff', '#0b0b0b', '#0b0b0b', '#0b0b0b'] as const

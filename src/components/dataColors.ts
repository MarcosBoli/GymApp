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
} as const

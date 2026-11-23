import { startOfWeek, toDateKey } from '../../domain/dates'

/** Lunes de la semana actual (se recalcula en cada render: cambia a medianoche del domingo). */
export const currentWeekStart = () => startOfWeek(toDateKey(new Date()))
export const todayKey = () => toDateKey(new Date())

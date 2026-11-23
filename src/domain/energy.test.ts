import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_FACTORS,
  adaptiveStatusText,
  adaptiveTdee,
  ageOn,
  bmrMifflin,
  calorieTarget,
  energyOverview,
  initialTdee,
  macroTargets,
  parseBodyweight,
  progressOf,
  trendOn,
  weeklyBalance,
  weightTrend,
  type DailyIntake,
  type WeightLog,
} from './energy'
import { addDays, dateRange } from './dates'

const TODAY = '2026-11-23'

describe('ageOn', () => {
  it.each([
    ['1995-06-15', '2026-06-14', 30],
    ['1995-06-15', '2026-06-15', 31],
    ['1995-06-15', '2026-11-23', 31],
    ['2000-02-29', '2027-02-28', 26],
    ['2000-02-29', '2027-03-01', 27],
  ])('%s el %s → %d', (b, on, age) => {
    expect(ageOn(b, on)).toBe(age)
  })
})

describe('bmrMifflin / initialTdee', () => {
  it('hombre: 10·80 + 6,25·180 − 5·30 + 5 = 1780', () => {
    expect(bmrMifflin({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 })).toBe(1780)
  })

  it('mujer: 10·60 + 6,25·165 − 5·25 − 161 = 1345,25', () => {
    expect(bmrMifflin({ sex: 'female', weightKg: 60, heightCm: 165, ageYears: 25 })).toBeCloseTo(1345.25)
  })

  it('factores de actividad', () => {
    expect(ACTIVITY_FACTORS).toEqual({ sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 })
    expect(initialTdee(1780, 'moderate')).toBeCloseTo(2759)
    expect(initialTdee(1780, 'sedentary')).toBeCloseTo(2136)
  })
})

describe('weightTrend', () => {
  it('vacío', () => {
    expect(weightTrend([])).toEqual([])
  })

  it('EMA diaria con α = 0,1', () => {
    const t = weightTrend([
      { date: '2026-11-01', weightKg: 80 },
      { date: '2026-11-02', weightKg: 81 },
      { date: '2026-11-03', weightKg: 79 },
    ])
    expect(t.map((p) => p.trendKg)).toEqual([80, 80.1, expect.closeTo(79.99, 10)])
    expect(t[1]).toMatchObject({ date: '2026-11-02', weightKg: 81 })
  })

  it('rellena huecos interpolando (sin weightKg en los días rellenados)', () => {
    const t = weightTrend([
      { date: '2026-11-01', weightKg: 80 },
      { date: '2026-11-03', weightKg: 82 },
    ])
    expect(t).toHaveLength(3)
    expect(t[1]).toEqual({ date: '2026-11-02', trendKg: 80.1 }) // valor interpolado 81
    expect(t[2]!.trendKg).toBeCloseTo(80.1 + 0.1 * (82 - 80.1))
  })

  it('ordena, y si hay dos pesajes el mismo día gana el último', () => {
    const t = weightTrend([
      { date: '2026-11-02', weightKg: 90 },
      { date: '2026-11-01', weightKg: 80 },
      { date: '2026-11-01', weightKg: 70 },
    ])
    expect(t[0]).toMatchObject({ date: '2026-11-01', weightKg: 70, trendKg: 70 })
  })

  it('suaviza: el ruido diario apenas mueve la tendencia', () => {
    const logs = dateRange('2026-10-01', '2026-10-30').map((date, i) => ({ date, weightKg: 80 + (i % 2 === 0 ? 1 : -1) }))
    const t = weightTrend(logs)
    expect(Math.abs(t.at(-1)!.trendKg - 80)).toBeLessThan(0.15)
  })

  it('trendOn: antes del primero undefined, después del último se mantiene', () => {
    const t = weightTrend([{ date: '2026-11-01', weightKg: 80 }, { date: '2026-11-05', weightKg: 79 }])
    expect(trendOn(t, '2026-10-31')).toBeUndefined()
    expect(trendOn(t, '2026-11-03')).toBe(t[2]!.trendKg)
    expect(trendOn(t, '2026-12-01')).toBe(t.at(-1)!.trendKg)
    expect(trendOn([], '2026-11-01')).toBeUndefined()
  })
})

// Escenario sintético: comes 2500 kcal/día y pierdes 0,05 kg/día durante 60 días.
// TDEE real = 2500 + 0,05·7700 = 2885.
function scenario(days = 60, kcal = 2500, slope = -0.05) {
  const dates = dateRange(addDays(TODAY, -(days - 1)), TODAY)
  const weights: WeightLog[] = dates.map((date, i) => ({ date, weightKg: 85 + slope * i }))
  const intake: DailyIntake[] = dates.map((date) => ({ date, kcal }))
  return { weights, intake }
}

describe('adaptiveTdee', () => {
  it('recupera el TDEE real en un escenario de pérdida constante', () => {
    const r = adaptiveTdee({ ...scenario(), today: TODAY })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.avgIntake).toBe(2500)
    // La EMA va con retraso; tras 60 días su pendiente casi iguala la real (transitorio (1−α)^n)
    expect(r.trendChangeKg).toBeCloseTo(-0.05 * 14, 2)
    expect(Math.abs(r.tdee - 2885)).toBeLessThan(5)
    expect(r.loggedDays).toBe(14)
  })

  it('peso estable → TDEE = ingesta media', () => {
    const r = adaptiveTdee({ ...scenario(60, 2300, 0), today: TODAY })
    expect(r.status === 'ok' && r.tdee).toBeCloseTo(2300)
  })

  it('ganando peso → TDEE por debajo de la ingesta', () => {
    const r = adaptiveTdee({ ...scenario(60, 3000, 0.03), today: TODAY })
    expect(r.status === 'ok' && Math.abs(r.tdee - (3000 - 0.03 * 7700))).toBeLessThan(5)
  })

  it('ignora días sin registro de comida al promediar', () => {
    const { weights, intake } = scenario(60, 2000, 0)
    const withGaps = intake.map((d, i) => (i % 5 === 0 ? { ...d, kcal: 0 } : d)).filter((d) => d.date !== addDays(TODAY, -1))
    const r = adaptiveTdee({ intake: withGaps, weights, today: TODAY })
    expect(r.status === 'ok' && r.avgIntake).toBe(2000)
    expect(r.status === 'ok' && r.loggedDays).toBeLessThan(14)
  })

  it('pocos días con comida registrada → insuficiente', () => {
    const { weights, intake } = scenario()
    const r = adaptiveTdee({ intake: intake.slice(-9), weights, today: TODAY })
    expect(r).toEqual({ status: 'insufficient', reason: 'intake', loggedDays: 9, weighIns: 14 })
  })

  it('pocos pesajes en la ventana → insuficiente', () => {
    const { intake } = scenario()
    const weights = [{ date: addDays(TODAY, -30), weightKg: 80 }, { date: addDays(TODAY, -3), weightKg: 79 }]
    expect(adaptiveTdee({ intake, weights, today: TODAY })).toMatchObject({ status: 'insufficient', reason: 'weight', weighIns: 1 })
  })

  it('sin pesajes anteriores a la ventana → insuficiente', () => {
    const { intake, weights } = scenario(14)
    expect(adaptiveTdee({ intake, weights, today: TODAY })).toMatchObject({ status: 'insufficient', reason: 'history' })
    // Con 15 días ya hay un pesaje el día anterior a la ventana
    expect(adaptiveTdee({ ...scenario(15), today: TODAY }).status).toBe('ok')
  })

  it('ignora datos futuros y de fuera de la ventana', () => {
    const { intake, weights } = scenario(60, 2500, 0)
    const extra = [...intake, { date: addDays(TODAY, 1), kcal: 9000 }, { date: addDays(TODAY, -20), kcal: 9000 }]
    const r = adaptiveTdee({ intake: extra, weights: [...weights, { date: addDays(TODAY, 1), weightKg: 50 }], today: TODAY })
    expect(r.status === 'ok' && r.avgIntake).toBe(2500)
    expect(r.status === 'ok' && r.trendChangeKg).toBeCloseTo(0)
  })

  it('parámetros configurables', () => {
    const r = adaptiveTdee({ ...scenario(30), today: TODAY, windowDays: 7, minLoggedDays: 7 })
    expect(r.status === 'ok' && r.loggedDays).toBe(7)
  })
})

describe('objetivos', () => {
  it('kcal según objetivo, con mínimo', () => {
    expect(calorieTarget(2500, 'maintain')).toBe(2500)
    expect(calorieTarget(2500, 'lose')).toBe(2000)
    expect(calorieTarget(2500, 'gain')).toBe(2750)
    expect(calorieTarget(1300, 'lose')).toBe(1200)
  })

  it('macros: 2 g/kg proteína, 25 % grasa, resto carbohidratos', () => {
    // 2400 kcal, 80 kg → P 160 g (640), G 67 g (603), C (2400 − 640 − 603)/4 = 289
    expect(macroTargets(2400, 80)).toEqual({ kcal: 2400, proteinG: 160, fatG: 67, carbsG: 289 })
  })

  it('carbohidratos nunca negativos', () => {
    expect(macroTargets(1200, 150).carbsG).toBe(0)
  })
})

describe('weeklyBalance', () => {
  it('7 días acabando hoy; hoy es parcial y no suma al total', () => {
    const intake = [
      { date: addDays(TODAY, -6), kcal: 2000 },
      { date: addDays(TODAY, -5), kcal: 2600 },
      { date: addDays(TODAY, -3), kcal: 0 }, // sin registrar
      { date: addDays(TODAY, -1), kcal: 2300 },
      { date: TODAY, kcal: 800 },
      { date: addDays(TODAY, -10), kcal: 5000 }, // fuera
    ]
    const w = weeklyBalance(intake, 2400, TODAY)
    expect(w.days.map((d) => d.date)).toEqual(dateRange(addDays(TODAY, -6), TODAY))
    expect(w.days.map((d) => d.balance)).toEqual([-400, 200, null, null, null, -100, -1600])
    expect(w.days.at(-1)).toMatchObject({ partial: true, kcal: 800 })
    expect(w.totalBalance).toBe(-300)
    expect(w.completeLoggedDays).toBe(3)
    expect(w.estimatedKgChange).toBeCloseTo(-300 / 7700)
  })
})

describe('energyOverview', () => {
  const profile = { sex: 'male', birthDate: '1995-11-24', heightCm: 180, activityLevel: 'moderate', goal: 'maintain' } as const
  const todayDay = { date: TODAY, kcal: 1000, proteinG: 60, carbsG: 100, fatG: 30 }

  it('sin perfil o sin peso → no listo, pero con lo consumido hoy', () => {
    expect(energyOverview({ weights: [], days: [todayDay], today: TODAY })).toEqual({
      ready: false, missing: 'profile', today: { kcal: 1000, proteinG: 60, carbsG: 100, fatG: 30 },
    })
    expect(energyOverview({ profile, weights: [{ date: addDays(TODAY, 1), weightKg: 80 }], days: [], today: TODAY })).toMatchObject({ ready: false, missing: 'weight' })
  })

  it('pocos datos → TDEE inicial (Mifflin × actividad)', () => {
    const o = energyOverview({ profile, weights: [{ date: TODAY, weightKg: 80 }], days: [todayDay], today: TODAY })
    expect(o.ready).toBe(true)
    if (!o.ready) return
    expect(o.bmr).toBe(1780) // 30 años: cumple 31 mañana
    expect(o.tdeeSource).toBe('initial')
    expect(o.tdee).toBeCloseTo(2759)
    expect(o.target.kcal).toBe(2759)
    expect(o.today.kcal).toBe(1000)
    expect(o.week.days).toHaveLength(7)
  })

  it('con 14+ días de datos → TDEE adaptativo', () => {
    const { weights, intake } = scenario()
    const days = intake.map((d) => ({ ...d, proteinG: 150, carbsG: 250, fatG: 80 }))
    const o = energyOverview({ profile: { ...profile, goal: 'lose' }, weights, days, today: TODAY })
    expect(o.ready && o.tdeeSource).toBe('adaptive')
    if (!o.ready) return
    expect(Math.abs(o.tdee - 2885)).toBeLessThan(5)
    expect(o.target.kcal).toBe(Math.round(o.tdee * 0.8))
    expect(o.weightKg).toBeCloseTo(85 - 0.05 * 59)
  })
})

describe('parseBodyweight', () => {
  it.each([
    ['80', 80],
    ['80,45', 80.5],
    [' 72.3 ', 72.3],
    ['', null],
    ['20', null],
    ['abc', null],
  ])('"%s" → %s', (t, v) => {
    expect(parseBodyweight(t)).toBe(v)
  })
})

describe('progressOf', () => {
  it('restante y exceso', () => {
    expect(progressOf(1500, 2000)).toEqual({ fraction: 0.75, remaining: 500, over: 0 })
    expect(progressOf(2300, 2000)).toEqual({ fraction: 1.15, remaining: 0, over: 300 })
    expect(progressOf(100, 0)).toEqual({ fraction: 0, remaining: 0, over: 100 })
  })
})

describe('adaptiveStatusText', () => {
  it.each([
    [{ status: 'ok', tdee: 1, avgIntake: 1, trendChangeKg: 0, loggedDays: 14, weighIns: 14 } as const, 'adaptativo'],
    [{ status: 'insufficient', reason: 'intake', loggedDays: 3, weighIns: 5 } as const, 'registra comida 3/10'],
    [{ status: 'insufficient', reason: 'weight', loggedDays: 12, weighIns: 1 } as const, 'pésate al menos 2 veces en 14 días (1/2)'],
    [{ status: 'insufficient', reason: 'history', loggedDays: 12, weighIns: 5 } as const, 'hace 15 días'],
  ])('%o', (a, text) => {
    expect(adaptiveStatusText(a)).toContain(text)
  })
})

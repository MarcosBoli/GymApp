# GymApp

PWA para iPhone (instalada desde Safari → "Añadir a pantalla de inicio") que sirve de **tracker de gym con rangos por músculo estilo LoL/Valorant** (Hierro → Bronce → … → Diamante → Maestro, etc., calculados a partir de tus marcas por grupo muscular), **registro de comidas y balance calórico** (ingesta vs. gasto). Es **100 % local y gratis**: sin backend, sin cuentas, sin APIs de pago. Todos los datos viven en IndexedDB en el propio dispositivo y la app funciona offline por completo.

## Stack

- **Vite + React + TypeScript** (strict)
- **React Router** (`react-router`, `createBrowserRouter`)
- **Tailwind CSS v4** (plugin `@tailwindcss/vite`, tema en `src/index.css` con `@theme`)
- **Dexie** (IndexedDB) + **dexie-react-hooks** (`useLiveQuery`) para datos persistentes
- **Zustand** solo para estado de UI efímero (modales, filtros, pasos de un formulario…), nunca para datos de dominio
- **Framer Motion** para animaciones
- **Recharts** para gráficas
- **vite-plugin-pwa** (Workbox `generateSW`, precache completo, `registerType: 'autoUpdate'`)
- **Vitest** para tests
- Despliegue en **Vercel**

## Estructura

```
src/
  db/          Dexie: esquema versionado + seed (db.ts), backup.ts (export/import), ids.ts (newId), persist.ts
  domain/      Lógica de negocio PURA (rangos, calorías, 1RM, backup…) + tests *.test.ts; types.ts = entidades
  components/  Componentes de UI reutilizables (layout/, icons/, …)
  pages/       Una página por tab/ruta: Inicio, Entrenar, Comida, Progreso, Perfil
  data/        Datos estáticos: músculos (muscles.ts), ejercicios con su mapeo a músculos (exercises.ts)…
  lib/         Utilidades de navegador sin lógica de negocio (guardar archivos, sonido…)
  store/       Stores Zustand de UI efímera (restTimer persistido en localStorage, trainUi)
  router.tsx   Rutas (/, /entrenar, /comida, /progreso, /perfil), cada página con `lazy` (chunk propio)
  main.tsx     Arranque: registro del SW, storage.persist(), render
  index.css    Tailwind + tema + utilidades safe-area (pt-safe, pb-safe, pl-safe, pr-safe)
public/        Iconos PWA/iOS (generados desde public/logo.svg)
```

## Convenciones

- **Lógica de negocio pura en `src/domain`**: funciones sin efectos (sin React, sin Dexie, sin `Date.now()` implícito: pasar fechas como parámetro), cada una con su test Vitest al lado (`foo.ts` + `foo.test.ts`).
- **Sin lógica en componentes**: los componentes solo leen datos (`useLiveQuery`), llaman a funciones de `domain`/`db` y pintan. Nada de cálculos, reglas ni transformaciones no triviales en JSX.
- **Mobile-first a 390 px de ancho** (iPhone 12–16). Contenido centrado con `max-w-lg`; no diseñar para escritorio.
- **Modo oscuro por defecto** (`class="dark"` en `<html>`, `color-scheme: dark`).
- **iOS**:
  - Respetar safe areas con las utilidades `pt-safe`/`pb-safe`/`pl-safe`/`pr-safe` o `env(safe-area-inset-*)`; el status bar es `black-translucent`, así que el contenido va por debajo de él.
  - Inputs con `font-size ≥ 16px` (ya forzado en `index.css`) para que Safari no haga zoom.
  - Inputs numéricos: `type="text" inputMode="decimal"` y parsear con `parseDecimal` de `src/domain/number.ts` (acepta coma decimal del teclado español).
  - Usar `dvh` en lugar de `vh` para alturas de pantalla completa.
- **Dexie** (`src/db/db.ts`):
  - Para cambiar el esquema añade `db.version(n + 1)` con `.upgrade()`; nunca modifiques una versión ya publicada.
  - Las entidades se tipan en `src/domain/types.ts` (sin Dexie). Unidades métricas (kg, cm, g).
  - IDs de texto: slugs fijos en el catálogo semilla (`chest`, `bench_press`), `newId()` (UUID) en datos del usuario.
  - Días como `DateKey` local `'YYYY-MM-DD'`; instantes como `Timestamp` (ms).
  - El catálogo se siembra con `populate` (BD nueva) y en el `upgrade` de la v2 (instalaciones v1). Para añadir ejercicios en el futuro: nueva versión con `.upgrade()` que haga `bulkPut` de los nuevos.
  - No duplicar datos derivables: peso actual = último `bodyweightLogs`; edad = `birthDate`. Excepción: `mealItems` guarda una copia de los valores del alimento para que el histórico no cambie.
  - Tests de BD con `fake-indexeddb/auto` y `createDb(nombreUnico)`.
- **Backup**: `exportAll`/`importAll` cubren automáticamente todas las tablas de `db.tables`; importar reemplaza todo en una transacción.
- **Ranking** (`src/domain/ranking.ts`, todo puro; parámetros en `src/data/rank-config.json` y estándares en `src/data/strength-standards.json`, ambos editables):
  - e1RM de Epley (reps limitadas a `e1rm.maxReps`); calentamientos ignorados; `addBodyweight` → peso corporal + lastre (lastre negativo = asistencia).
  - Score de ejercicio = ratio e1RM/peso corporal interpolado contra 5 niveles (`levelScores`). Mancuernas: peso de UNA mancuerna. Sin estándar → no puntúa fuerza, sí constancia.
  - Score de músculo = 80 % fuerza (media ponderada por factor, ventana 42 d) + 20 % constancia (series efectivas 7 d, óptimo 10-20).
  - Tiers con divisiones IV-I (3 puntos de score = 100 LP); Maestro y Leyenda sin divisiones.
  - Promos: `advancePromotion` por sesión que entrena el músculo; el estado se persiste fuera del dominio. Usar `displayedRank` para mostrar.
  - `computeRankings` es el punto de entrada; `rankSnapshot` + `diffRanks` para el resumen post-entreno.
- **Entreno** (`src/db/workouts.ts`, `src/domain/workout.ts`, `src/domain/summary.ts`):
  - Entreno en curso = `workout` sin `endedAt`; `exerciseIds` guarda el orden (también ejercicios sin series). Cada serie se escribe en Dexie al confirmarla.
  - `finishWorkout` calcula el "Resumen de partida" con `buildWorkoutSummary` (puro), lo guarda en `workout.summary` y persiste las promos en `rankStates` (v3). El resumen no se recalcula al recargar.
  - Temporizador de descanso: solo `endsAt` (timestamp) en Zustand persistido; el restante es `endsAt - ahora`. Sonido con Web Audio desbloqueado en el toque de "Guardar serie" (`unlockAudio`).
  - Pesos de ejercicios `equipment: 'bodyweight'` = lastre (vacío = 0, negativo = asistencia).
- **Comida y energía** (`src/db/food.ts`, `src/db/barcode.ts`, `src/domain/food.ts`, `src/domain/energy.ts`):
  - Escáner: `@zxing/browser` (cámara trasera, EAN/UPC), cargado con `lazy`. `resolveBarcode`: local → Open Food Facts (se guarda en `foods` si viene completo) → alta manual con el código precargado.
  - Recientes se derivan de las comidas; favoritos con `food.isFavorite`. `mealItems` guardan copia de los valores por 100 g y `createdAt` para el orden.
  - TDEE: Mifflin-St Jeor × factor de actividad; adaptativo con 14 días = ingesta media (solo días con registros, mín. 10) − Δ peso tendencial × 7700 / 14. Tendencia = EMA diaria α 0,1 con huecos interpolados. Objetivo: −20 % / 0 / +10 %; proteína 2 g/kg, grasa 25 %.
  - Colores de datos validados con la skill dataviz en `src/components/dataColors.ts` (hex: no usar `var()` en atributos SVG).
- **Carga diferida**: cada página va en su propio chunk (`lazy` en `router.tsx`); lo pesado y secundario dentro de una página (Recharts, zxing) con `React.lazy` + `Suspense`. El SW precachea todos los chunks (offline intacto) y `vite:preloadError` recarga si falta un chunk de una versión anterior.
- **Inicio y Progreso** (`src/domain/progress.ts`, `src/domain/emblem.ts`, `src/data/bodyMap.ts`):
  - `buildRankOverview` da los rangos a mostrar (respetando promos), eslabón débil e inactivos; `getRankingInputs` (db) aporta los datos.
  - Silueta: polígonos propios de la mitad izquierda en `bodyMap.ts`, reflejados con `mirrorPoints`; cada músculo es un `<g role="button">` con `aria-label` y hay una lista equivalente debajo (el rango nunca va solo en el color).
  - Emblemas procedurales (`EMBLEM_SPECS`): cada tier añade capas; el test exige complejidad estrictamente creciente. No copiar emblemas de ningún juego.
  - Progreso: peso bruto + tendencia, mapa de calor de series/semana (rampa azul secuencial en `VOLUME_RAMP`) e historial de rangos desde `workout.summary`.
- Textos de la UI en español. Rutas en español.
- Cámara (`getUserMedia`, p. ej. escáner de códigos de barras) **solo funciona en HTTPS** → probar en las previews de Vercel, no en `http://<ip-local>`.

## Comandos

```bash
npm install                 # instalar dependencias
npm run dev                 # servidor de desarrollo (expuesto en la red local con --host)
npm run build               # typecheck (tsc -b) + build de producción en dist/
npm run preview             # servir dist/ (el service worker solo funciona en build/preview)
npm test                    # tests Vitest (una pasada)
npm run test:watch          # tests en modo watch
npm run typecheck           # solo comprobación de tipos
npm run generate-pwa-assets # regenerar iconos desde public/logo.svg
```

Desarrollo en Windows: los scripts son multiplataforma y `.gitattributes` fuerza finales de línea LF.

## Flujo de trabajo (Claude)

Al terminar un cambio, sin pedir confirmación: hacer commit, push a la rama de trabajo, abrir PR contra `main` (o actualizar el existente) y vigilar el PR (checks, comentarios, reviews) para corregir lo que falle.

## Despliegue (Vercel)

- `vercel.json` define framework Vite, salida `dist/`, rewrite SPA a `index.html` y cabeceras sin caché para `sw.js`, `manifest.webmanifest` e `index.html` (assets con hash: caché inmutable).
- Importar el repo en Vercel: cada push a una rama genera una preview con HTTPS (necesario para la cámara del iPhone y para instalar la PWA con service worker); `main` va a producción.

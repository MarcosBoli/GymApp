# GymApp

PWA para iPhone (instalada desde Safari → "Añadir a pantalla de inicio") que sirve de **tracker de gym con rangos por músculo estilo LoL/Valorant** (Novato → Aprendiz → Atleta → Veterano → Élite → Titán, calculados a partir de tus marcas por grupo muscular), **registro de comidas y balance calórico** (ingesta vs. gasto). Es **100 % local y gratis**: sin backend, sin cuentas, sin APIs de pago. Todos los datos viven en IndexedDB en el propio dispositivo y la app funciona offline por completo.

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
  lib/         Utilidades de navegador sin lógica de negocio (guardar archivos, sonido, cliente de /api…)
  store/       Stores Zustand de UI efímera (restTimer persistido en localStorage, trainUi)
  router.tsx   Rutas (/, /entrenar, /entrenar/plan, /comida, /progreso, /perfil), cada página con `lazy` (chunk propio)
  main.tsx     Arranque: registro del SW, storage.persist(), render
  index.css    Tailwind + tema + utilidades safe-area (pt-safe, pb-safe, pl-safe, pr-safe)
public/        Iconos PWA/iOS (generados desde assets-src/logo.png)
api/           Funciones serverless de Vercel (entradas finas: health, chat, plan, food-estimate, meal-suggestions, recipe)
server/ai/     Lógica de las funciones: secreto, límites, validación, llamada a Claude, errores (+ tests)
```

## Convenciones

- **Lógica de negocio pura en `src/domain`**: funciones sin efectos (sin React, sin Dexie, sin `Date.now()` implícito: pasar fechas como parámetro), cada una con su test Vitest al lado (`foo.ts` + `foo.test.ts`).
- **Sin lógica en componentes**: los componentes solo leen datos (`useLiveQuery`), llaman a funciones de `domain`/`db` y pintan. Nada de cálculos, reglas ni transformaciones no triviales en JSX.
- **Mobile-first a 390 px de ancho** (iPhone 12–16). Contenido centrado con `max-w-lg`; no diseñar para escritorio.
- **Modo oscuro por defecto** (`class="dark"` en `<html>`, `color-scheme: dark`). Tema negro y rojo (a juego con insignias e icono): fondos casi negros cálidos (`--color-bg` #0b0909, `--color-surface` #171212, `--color-border` #2c2222), grises `neutral-*` (no `zinc`) y acento rojo `--color-accent` #ff4545 (texto oscuro encima en botones). Colores semánticos aparte: rojo errores, ámbar avisos, verde hecho.
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
  - No duplicar datos derivables: peso actual = último `bodyweightLogs`; edad = `birthDate`. Excepciones: `mealItems` guarda una copia de los valores del alimento (histórico estable) y la `date` de su comida (v5, indexada para leer rangos de días en una consulta; `fillMealItemDates` la rellena en migraciones e imports antiguos).
  - v4 añade el índice `performedAt` en `sets`. El entreno en curso se localiza con `settings.activeWorkoutId` (O(1), independiente de fechas).
  - Tests de BD con `fake-indexeddb/auto` y `createDb(nombreUnico)`.
- **Backup**: `exportAll`/`importAll` cubren automáticamente todas las tablas de `db.tables`; importar reemplaza todo en una transacción.
- **Ranking** (`src/domain/ranking.ts`, todo puro; parámetros en `src/data/rank-config.json` y estándares en `src/data/strength-standards.json`, ambos editables):
  - e1RM de Epley (reps limitadas a `e1rm.maxReps`); calentamientos ignorados; `addBodyweight` → peso corporal + lastre (lastre negativo = asistencia).
  - Score de ejercicio = ratio e1RM/peso corporal interpolado contra 5 niveles (`levelScores`). Mancuernas: peso de UNA mancuerna. Sin estándar → no puntúa fuerza, sí constancia.
  - Score de músculo = 80 % fuerza (media ponderada por factor, ventana 42 d) + 20 % constancia (series efectivas 7 d, óptimo 10-20).
  - 6 tiers (Novato, Aprendiz, Atleta, Veterano, Élite, Titán), todos con 3 divisiones III → II → I; cada división = 100 LP (anchos de score no lineales: tiers altos más estrechos).
  - `minScore` anclados a `strength-standards.json` suponiendo constancia óptima (score = 0,8 × fuerza + 20): Aprendiz = principiante (28), Atleta = novato (44), Veterano = intermedio (60), Élite = mitad intermedio-avanzado (70), Titán = avanzado (80). Un test vigila el anclaje.
  - `color` de cada tier = color del músculo en el mapa corporal (definido a mano: las insignias son casi todas rojas). Paleta validada con la skill dataviz sobre la superficie oscura (todos los pares ΔE ≥ 8 con protanopia/deuteranopia).
  - Dexie v8 (`migrateRanksToSixTiers`, también al importar backups < v8): resúmenes recalculados por `score` (`remapSummaryRanks`) y `rankStates` vaciado (las promos antiguas apuntaban a tiers que ya no existen).
  - Promos: `advancePromotion` por sesión que entrena el músculo; el estado se persiste fuera del dominio. Usar `displayedRank` para mostrar.
  - `computeRankings` es el punto de entrada; `rankSnapshot` + `diffRanks` para el resumen post-entreno.
- **Entreno** (`src/db/workouts.ts`, `src/domain/workout.ts`, `src/domain/summary.ts`):
  - Entreno en curso = `workout` sin `endedAt`; `exerciseIds` guarda el orden (también ejercicios sin series). Cada serie se escribe en Dexie al confirmarla.
  - `finishWorkout` calcula el "Resumen de partida" con `buildWorkoutSummary` (puro), lo guarda en `workout.summary` y persiste las promos en `rankStates` (v3). El resumen no se recalcula al recargar.
  - Temporizador de descanso: solo `endsAt` (timestamp) en Zustand persistido; el restante es `endsAt - ahora`. Sonido con Web Audio desbloqueado en el toque de "Guardar serie" (`unlockAudio`).
  - Pesos de ejercicios `equipment: 'bodyweight'` = lastre (vacío = 0, negativo = asistencia).
  - Músculos de cada ejercicio: `exerciseMuscleNames` (puro, principales factor 1 / secundarios) → `catalog.musclesByExercise`; se pintan con `ExerciseMuscles` ("Pecho · también Tríceps") en la tarjeta del entreno, el plan y los buscadores. La búsqueda solo usa los principales.
- **Comida y energía** (`src/db/food.ts`, `src/db/barcode.ts`, `src/domain/food.ts`, `src/domain/energy.ts`):
  - Escáner: `@zxing/browser` (cámara trasera, EAN/UPC), cargado con `lazy`. `resolveBarcode`: local → Open Food Facts (se guarda en `foods` si viene completo) → alta manual con el código precargado.
  - Recientes se derivan de las comidas; favoritos con `food.isFavorite`. `mealItems` guardan copia de los valores por 100 g y `createdAt` para el orden.
  - TDEE: Mifflin-St Jeor × factor de actividad; adaptativo con 14 días = ingesta media (solo días con registros, mín. 10) − Δ peso tendencial × 7700 / 14. Tendencia = EMA diaria α 0,1 con huecos interpolados. Objetivo: −20 % / 0 / +10 %; proteína 2 g/kg, grasa 25 %.
  - Colores de datos validados con la skill dataviz en `src/components/dataColors.ts` (hex: no usar `var()` en atributos SVG). Series únicas (tendencia, e1RM, historial de rangos) y el mapa de calor (rampa roja `VOLUME_RAMP`) en el rojo del tema; macros y déficit/superávit conservan tonos distintos.
- **Carga diferida**: cada página va en su propio chunk (`lazy` en `router.tsx`); lo pesado y secundario dentro de una página (Recharts, zxing) con `React.lazy` + `Suspense`. El SW precachea todos los chunks (offline intacto) y `vite:preloadError` recarga si falta un chunk de una versión anterior.
- **Inicio y Progreso** (`src/domain/progress.ts`, `src/components/rank/Emblem.tsx`, `src/data/bodyMap.ts`):
  - `buildRankOverview` da los rangos a mostrar (respetando promos), eslabón débil e inactivos; `getRankingInputs` (db) aporta los datos.
  - Silueta: trazos de `assets-src/body/front.svg` y `back.svg` (un color plano por músculo) convertidos a `src/data/bodyMapPaths.ts` con `node scripts/generate-body-map.mjs` (el color decide el músculo; tabla `PALETTE` en el script). No editar `bodyMapPaths.ts` a mano. Cada músculo es un `<g role="button">` con `aria-label` y hay una lista equivalente debajo (el rango nunca va solo en el color).
  - Giro delante/detrás (`BodyMap.tsx` + `src/domain/bodyFlip.ts`, guías "Designing Fluid Interfaces"): carta de dos caras (`perspective: 1000px`, `preserve-3d`, caras con `backface-visibility: hidden` + prefijo `-webkit-` y `translateZ(0)` contra el parpadeo de Safari; la trasera rotada 180°). Las dos caras se renderizan una vez (memoizadas: no repintar los trazos por fotograma); solo se anima el `rotateY` del contenedor (`will-change: transform`) con un motion value del ángulo, acumulado (0, 180, 360…; la vista sale de `viewForAngle`).
  - Gesto: pointer events propios (no `drag` de framer). Umbral de 6 px para distinguir toque de arrastre; vertical = scroll (`touch-action: pan-y`); horizontal = ángulo base + dx × 180 / ancho. Al soltar: proyección de Apple (v/1000 × 0,998 / (1 − 0,998)) y `flipTarget` (> 90° respecto a la cara de partida → media vuelta en el sentido del gesto; máx. una por gesto). Cierre con `animate(ángulo, destino, { type: 'spring', bounce: 0.12, duration: 0.45, velocity })` (velocidad del dedo en °/s: sin costura); interrumpible (`angle.stop()` al tocar). Botones Delante/Detrás: mismo muelle sin velocidad. `useHomeUi.view` se actualiza al terminar; la cara oculta va con `inert` + `aria-hidden`. Tras arrastrar se suprime el click (no abre la ficha).
  - Luz: capa negra (opacidad |sin(ángulo)| × 0,5, máxima de perfil) y sombra elíptica bajo los pies (scaleX 0,6 + 0,4 × |cos|), ambas con `useTransform` (sin estado de React por fotograma). Con `useReducedMotion`: sin rotación, fundido de opacidad de 150 ms (swipe y botones).
  - Insignias: imágenes propias en `src/assets/ranks/rank-N-<id>.png` (512 px, originales); la app usa las WebP de 256 px de `src/assets/ranks/web/` (`npm run optimize-rank-images` tras cambiar un PNG), mapeadas por id de tier en `rankImages.ts`. Encima, por código: pips de división (III → 1 … I → 3) y estados de `emblemState` (bloqueada = sin rango, inactiva, promo con brillo del color del tier).
  - Progreso: peso bruto + tendencia, mapa de calor de series/semana (rampa roja secuencial en `VOLUME_RAMP`) e historial de rangos desde `workout.summary`.
- **Rendimiento** (medido con 1 año de datos y CPU ×4):
  - Nunca leer tablas enteras que crecen con el tiempo (`sets`, `mealItems`, `workouts`) si basta una ventana: usar los índices `sets.performedAt`, `[exerciseId+performedAt]` y `mealItems.date`. Evitar `anyOf` con cientos de claves (un viaje a IndexedDB por clave).
  - Gráficas Recharts sin animación (`isAnimationActive={false}`) y ≤ ~120 puntos (`bucketWeightTrend` agrega por semanas).
  - Pantallas con varias consultas: render progresivo (cada bloque al llegar sus datos, con placeholder) en vez de esperar a todas.
  - `npm run fake-data` genera un año de datos realista (`fake-data/`, ignorado en git) para importar desde Perfil y medir.
- **Barra de pestañas** (`BottomTabBar.tsx`, `src/domain/navigation.ts`): el indicador (pastilla + línea roja con brillo) se mueve por índice con `translateX` y un muelle (`bounce` 0,22, 0,5 s) sobre un motion value, y se estira con la velocidad (`indicatorStretch`). NO usar `layoutId`: la barra es `fixed` y la animación de layout medida con el scroll de la página lo hacía bajar y saltar. `activeTabIndex` decide la pestaña (subrutas incluidas: `/entrenar/plan` → Entrenar). Con movimiento reducido, salta sin animar.
- **iOS/UX**: franja con desenfoque bajo la status bar (`AppShell`), `ScrollRestoration` por pestaña, recordatorio de backup en Perfil y punto en la pestaña si hay datos y la última copia tiene más de 14 días (`backupReminder`). El SW busca actualización al volver a primer plano.
- **IA (funciones serverless de Vercel)** (`api/`, `server/ai/`, `src/lib/aiClient.ts`, `src/domain/aiErrors.ts`):
  - `api/*.ts` son entradas finas (firma web `export default { fetch }`); la lógica está en `server/ai/` con dependencias inyectadas y tests sin red. Imports con extensión `.js` (ESM de Node); Vercel compila con el `compilerOptions` del `tsconfig.json` raíz (no sigue `references`).
  - SDK oficial `@anthropic-ai/sdk` solo en el servidor. Variables: `ANTHROPIC_API_KEY`, `APP_SECRET` (obligatorias), `PLAN_MODEL` (def. `claude-sonnet-5-5`), `CHAT_MODEL` (def. `claude-haiku-5-5`), `FOOD_MODEL` (def. `claude-sonnet-5-5`), `MEAL_MODEL` (def. `claude-haiku-5-5`), `RECIPE_MODEL` (def. `claude-sonnet-5-5`). Nunca exponer la key al cliente. `/api/health` comprueba cada modelo distinto una vez.
  - Cada petición lleva `x-app-secret` (comparación en tiempo constante; 401 si no coincide). El secreto vive en `localStorage` del dispositivo (Perfil › Asistente IA), fuera de los backups.
  - Cuerpo ≤ `AI_MAX_BODY_BYTES` (64 KB, comprobado en app y servidor; `/api/food-estimate` admite hasta `FOOD_ESTIMATE_MAX_BODY_BYTES` = 1,5 MB por la foto en base64), validación de forma y tamaños; `maxDuration` 60 s (vercel.json) con timeouts del SDK por debajo.
  - Errores: clases tipadas del SDK → códigos de `aiErrors.ts` (sin saldo, límite de gasto, timeout, JSON inválido…) con mensaje en español; el cliente también traduce respuestas que no son nuestras (504 de Vercel, sin conexión, /api no desplegada).
  - Sonnet 5.5 (y otros modelos 5.x compatibles) con `fallbacks: "default"` del servidor ante negativas; `stop_reason: "refusal"` → error `refused`.
- **Rutina semanal con IA** (`src/domain/coachContext.ts`, `src/domain/plan.ts`, `src/domain/planSchema.ts`, `src/db/plans.ts`, `src/db/planGeneration.ts`, `server/ai/plan.ts`):
  - `buildCoachContext` (puro): perfil + preferencias (objetivo fuerza/hipertrofia/recomposición, días, minutos, material, limitaciones), por músculo rango/LP/tendencia de e1RM 4 sem/series semanales/días desde el último, eslabón débil y semana anterior (adherencia + valoración). Las preferencias se editan en Perfil › Entrenamiento.
  - `planSchema.ts` (zod, sin imports relativos: lo usa también el servidor) define petición, salida (`exerciseId` como enum del catálogo) y `planErrors` (reglas extra). `/api/plan` usa salida estructurada (`betaZodOutputFormat` en `create`), valida con zod y reintenta UNA vez con los errores si queda tiempo dentro de los 60 s.
  - El modelo nunca da pesos: `suggestWeight` (Epley inverso con reps centrales + RIR del RPE, redondeo por material) a partir del mejor e1RM de 90 días.
  - Dexie v6: `weeklyPlans` (versiones por semana; regenerar/editar/restaurar = versión nueva, la anterior queda `superseded`) y `weekFeedback`. Los entrenos guardan `planId`/`planDayIndex`.
  - "Día que toca" (`dayToTrain`): el de hoy si está pendiente, si no el primer pendiente. Valoración: el domingo de la semana con plan y, al generar, la semana anterior si tuvo actividad (`weekToRate`).
- **Chat del coach** (`server/ai/chat.ts`, `src/domain/chatStream.ts`, `src/domain/coachChat.ts`, `src/domain/chatMarkdown.ts`, `src/db/coachChat.ts`, `src/components/coach/`):
  - `/api/chat` responde en streaming NDJSON (`delta` / `done` / `error`, protocolo en `chatStream.ts`, compartido sin imports relativos). Errores antes de empezar → JSON con estado HTTP; a mitad → evento `error`. Negativa → `refused` y la app descarta el parcial. Presupuesto de 55 s (luego `done` con `truncated`); si la app cancela, se aborta la petición a Claude.
  - `streamCoachChat` (`src/lib/aiClient.ts`): "Parar" o corte a medias → devuelve lo recibido como truncado; 30 s sin datos = colgado.
  - Dexie v7: `chatMessages` (`[threadKey+createdAt]`), un hilo por ejercicio (`threadKey` = exerciseId) o `general` (desde el plan). `askCoach` guarda la pregunta antes de llamar (si falla, "Reintentar" la reenvía sin duplicarla) y la respuesta al terminar.
  - Contexto (`buildChatContext`, ≤ 16 000 caracteres): ejercicio (material, músculos, mejor e1RM 90 d, objetivo en el plan), rutina de la semana con los pesos de la app y nivel (rango global, eslabón débil, rangos por músculo con los del ejercicio primero). `chatRequestMessages` recorta el historial a los límites del servidor (`CHAT_LIMITS`).
  - Dolor: lo indica el system prompt (parar y consultar a fisio/médico, sin diagnosticar) y además la app muestra un aviso fijo si la última pregunta lo menciona (`mentionsPain`).
  - Respuestas con markdown mínimo (párrafos, listas, negrita) renderizado sin HTML (`parseChatMarkdown`). La hoja usa `useVisualViewport` para quedar encima del teclado de iOS.
- **Comida con IA: foto, texto o ambos** (`server/ai/foodEstimate.ts`, `src/domain/foodEstimateSchema.ts`, `src/domain/foodEstimate.ts`, `src/domain/foodDraft.ts`, `src/lib/photo.ts`, `src/lib/describeDraft.ts`, `src/components/food/EstimateFlow.tsx`):
  - `/api/food-estimate` (sustituye a `/api/food-photo`): `{ description?, image? (JPEG base64), previousQuestions?, answers? }` (texto o foto obligatorio). System prompt de nutricionista: alimentos mencionados o visibles (no inventa salvo aceite/salsa probables, marcados en `supuesto`), medidas caseras españolas, referencias visuales en fotos, valores BEDCA/europeos, platos típicos y marcas de supermercado; "no es comida" → `reconocida: false`.
  - Dos herramientas (esquemas JSON desde zod con `z.toJSONSchema`, claves en español) con `tool_choice` automático — NUNCA forzar (`{type: "tool"}`/`"any"` → 400 en Sonnet/Opus 5.5 y Fable 5.1+): `registrar_estimacion` (items con nombre, gramos, kcal, macros, confianza alta|media|baja y `supuesto` + totales + comentario) o `hacer_preguntas` (≤ 3 preguntas con 2-4 opciones; solo si cambiarían > 20 % las kcal; la app añade "No lo sé" y el modelo asume lo habitual en España). El servidor numera las preguntas `r<tanda>q<n>`; tras `MAX_QUESTION_ROUNDS` (2) tandas ya no ofrece `hacer_preguntas`. Validación zod + `estimateErrors`/`questionErrors`; UN reintento con los errores si queda tiempo; si no → `invalid_estimate`. Los totales se recalculan desde los items.
  - Cliente: "Escanear", "Foto" y "Describir" en Añadir (hoja `estimate` con `mode` photo|text, chunk propio). Foto: cámara (`capture="environment"`) y galería; `preparePhoto` a 1024 px, JPEG 0,8, orientación EXIF corregida. Texto y foto se combinan (la descripción es la nota de la foto). El texto de "Describir" se guarda en `localStorage` (`describeDraft`) hasta guardar la comida.
  - Preguntas: chips por pregunta (opciones + "No lo sé"; sin contestar = "No lo sé") y "Calcular"; `buildEstimateRequest` envía todas las tandas con sus respuestas.
  - Borrador (`FoodDraftItem` con valores por 100 g): gramos editables con recálculo proporcional, confianza (texto + color), "Supuesto: …" bajo cada alimento, borrar/añadir a mano, totales arriba, selector de comida y "Guardar en …".
  - `saveEstimatedFoods`: un `food` por alimento con `source: 'ia-foto'` (si hubo foto) o `'ia-texto'` (por 100 g, ración = gramos; se reutiliza cualquier alimento estimado con IA con el mismo nombre) + sus `mealItems` → salen en recientes y se reutilizan sin IA. La foto NUNCA se guarda.
- **"¿Qué como?": recomendador de comidas y recetas** (`src/domain/mealSchema.ts`, `src/domain/mealSuggestContext.ts`, `src/domain/recipes.ts`, `server/ai/meals.ts`, `server/ai/tools.ts`, `src/db/mealSuggest.ts`, `src/db/recipes.ts`, `src/components/food/SuggestFlow.tsx`, `RecipeView.tsx`):
  - Preferencias en Perfil › Comidas (`UserProfile`: `foodDislikes`, `diet`, `budget`, `utensils`, `maxCookMinutes`); sin ellas (`mealPrefsFromProfile` → null) la hoja pide rellenarlas.
  - `buildMealSuggestContext` (puro): objetivo (déficit/mantenimiento/superávit), lo que QUEDA hoy (`remainingToday`, puede ser negativo), objetivo de la comida (`mealTarget`: reparto 25/35/10/30 entre las comidas que faltan), `ligera` si queda < 250 kcal, preferencias, nombres de las comidas de los últimos 3 días y petición libre. Comida por defecto según la hora (`mealForHour`).
  - `server/ai/tools.ts`: bucle compartido `callToolWithRetry` (tool_choice automático, UN reintento con los errores si queda tiempo, negativa → `refused`) y `toolFromZod`; lo usan food-estimate, meal-suggestions y recipe.
  - `/api/meal-suggestions` (MEAL_MODEL): 6 opciones en DOS llamadas en paralelo (3 `sencilla` ≤ 15 min y ≤ 6 ingredientes; 3 `elaborada` ≤ 45 min o el máximo del perfil), cada una validada y reintentada por su cuenta (la mitad de salida → la mitad de espera); si falla solo una tanda se devuelven las otras con `aviso`. `suggestionErrors` (con `kind`) exige 3 del tipo, kcal ≈ 4P+4C+9G (±10 %), límites, nombres únicos y fuera de `excluir` ("Otras opciones" manda todo lo ya visto). Ids normalizados `s1..s3`/`e1..e3`.
  - `/api/recipe` (RECIPE_MODEL): ingredientes con gramos, medida casera y macros; `recipeErrors` exige que sumen lo prometido (±10 %) y coherencia por ingrediente; los totales se recalculan desde los ingredientes.
  - Dexie v9: `recipes` (`&key` = nombre normalizado): caché de recetas (reabrir no gasta IA) y favoritas → "Mis recetas" en Comida. "Buscar en la web" = búsqueda de Google construida en la app (`webSearchUrl`), nunca URLs del modelo.
  - "Me la he comido": abre el borrador editable de la estimación (`EstimateFlow` con `prefilled`) con los ingredientes de la receta (`draftFromRecipe`) o, sin receta, la ración estimada (`draftFromSuggestion`); se guarda con `source: 'ia-receta'`.
  - Entradas: botón en Comida (hoy) y en Inicio si quedan kcal (abre la hoja en Comida).
  - Carga: a los 15 s avisa de que tarda (hasta ~1 min) y "Cancelar" ignora la respuesta tardía (id de petición).
- `MotionConfig reducedMotion="user"`: con "Reducir movimiento" de iOS no hay desplazamientos animados.
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
npm run generate-pwa-assets # regenerar iconos desde assets-src/logo.png
npm run optimize-rank-images # insignias de rango PNG → WebP 256 px (src/assets/ranks/web)
npm run fake-data           # 1 año de datos falsos → fake-data/*.json (importar en Perfil)
npx vercel dev              # app + funciones /api en local (lee .env.local; ver .env.example)
```

Desarrollo en Windows: los scripts son multiplataforma y `.gitattributes` fuerza finales de línea LF.

## Memoria del proyecto (Obsidian)

Las notas del proyecto viven en el vault de Obsidian, en la carpeta `Proyectos/GymApp`, añadida como directorio adicional en `.claude/settings.local.json` (no se sube a git: la ruta cambia en cada equipo). Notas: `GymApp` (índice), `Visión`, `Rangos`, `IA`, `Arquitectura`, `Roadmap`, `Decisiones`, `Sesiones` y `Mapa.canvas`.

- **Al empezar una sesión** (o si Marcos pregunta "¿en qué nos quedamos?"): lee `GymApp`, `Roadmap` y la última entrada de `Sesiones`, resume el estado y propón el siguiente paso del Roadmap.
- **Al terminar una tarea o cuando Marcos diga "cerramos"**, antes del commit: mueve lo hecho a "Hecho" en `Roadmap` (con fecha), apunta en `Decisiones` las decisiones técnicas con su motivo (usa la plantilla de la nota) y añade arriba en `Sesiones` una entrada con fecha, qué se hizo y qué queda. Si cambia algo de rangos, IA o stack, actualiza `Rangos`, `IA` o `Arquitectura`.
- Reglas del vault: enlaces internos siempre como `[[wikilinks]]`, frontmatter YAML con `tags` y `fecha` en notas nuevas, no borrar ni renombrar notas sin preguntar, no tocar `.obsidian/`.
- Si la carpeta de notas no está accesible, avisa a Marcos en vez de seguir sin ella.

## Flujo de trabajo (Claude)

Al terminar un cambio, sin pedir confirmación: hacer commit, push a la rama de trabajo, abrir PR contra `main` (o actualizar el existente) y vigilar el PR (checks, comentarios, reviews) para corregir lo que falle.

## Despliegue (Vercel)

- `vercel.json` define framework Vite, salida `dist/`, rewrite SPA a `index.html` y cabeceras sin caché para `sw.js`, `manifest.webmanifest` e `index.html` (assets con hash: caché inmutable).
- Importar el repo en Vercel: cada push a una rama genera una preview con HTTPS (necesario para la cámara del iPhone y para instalar la PWA con service worker); `main` va a producción.

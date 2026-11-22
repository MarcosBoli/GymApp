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
  db/          Dexie: esquema (db.ts), migraciones y acceso a datos; persist.ts (navigator.storage.persist)
  domain/      Lógica de negocio PURA (cálculo de rangos, calorías, 1RM, volumen…) + tests *.test.ts
  components/  Componentes de UI reutilizables (layout/, icons/, …)
  pages/       Una página por tab/ruta: Inicio, Entrenar, Comida, Progreso, Perfil
  data/        Datos estáticos (catálogo de ejercicios, músculos, umbrales de rango, alimentos base…)
  router.tsx   Rutas (/, /entrenar, /comida, /progreso, /perfil)
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
- **Dexie**: para cambiar el esquema añade `db.version(n + 1)` con `.upgrade()`; nunca modifiques una versión ya publicada.
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

## Despliegue (Vercel)

- `vercel.json` define framework Vite, salida `dist/`, rewrite SPA a `index.html` y cabeceras sin caché para `sw.js`, `manifest.webmanifest` e `index.html` (assets con hash: caché inmutable).
- Importar el repo en Vercel: cada push a una rama genera una preview con HTTPS (necesario para la cámara del iPhone y para instalar la PWA con service worker); `main` va a producción.

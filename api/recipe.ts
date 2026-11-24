import { createAiHandlers } from '../server/ai/handlers.js'

// Función de Vercel (runtime Node.js, firma web estándar): POST /api/recipe (receta de una opción)
const handlers = createAiHandlers({ env: process.env })

export default {
  fetch: (request: Request) => handlers.recipe(request),
}

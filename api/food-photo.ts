import { createAiHandlers } from '../server/ai/handlers.js'

// Función de Vercel (runtime Node.js, firma web estándar): POST /api/food-photo
const handlers = createAiHandlers({ env: process.env })

export default {
  fetch: (request: Request) => handlers.foodPhoto(request),
}

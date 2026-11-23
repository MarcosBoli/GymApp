import { createAiHandlers } from '../server/ai/handlers.js'

// Función de Vercel (runtime Node.js, firma web estándar): GET /api/health
const handlers = createAiHandlers({ env: process.env })

export default {
  fetch: (request: Request) => handlers.health(request),
}

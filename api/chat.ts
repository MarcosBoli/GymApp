import { createAiHandlers } from '../server/ai/handlers.js'

// Función de Vercel (runtime Node.js, firma web estándar): POST /api/chat
const handlers = createAiHandlers({ env: process.env })

export default {
  fetch: (request: Request) => handlers.chat(request),
}

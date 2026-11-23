/** Configuración de las funciones de IA a partir de las variables de entorno de Vercel. */

export const DEFAULT_PLAN_MODEL = 'claude-sonnet-5-5'
export const DEFAULT_CHAT_MODEL = 'claude-haiku-5-5'

export interface AiConfig {
  apiKey: string
  appSecret: string
  planModel: string
  chatModel: string
}

export type Env = Record<string, string | undefined>

export function readAiConfig(env: Env): { ok: true; config: AiConfig } | { ok: false; missing: string[] } {
  const apiKey = env.ANTHROPIC_API_KEY?.trim()
  const appSecret = env.APP_SECRET?.trim()
  const missing = [!apiKey && 'ANTHROPIC_API_KEY', !appSecret && 'APP_SECRET'].filter((v): v is string => Boolean(v))
  if (missing.length) return { ok: false, missing }
  return {
    ok: true,
    config: {
      apiKey: apiKey!,
      appSecret: appSecret!,
      planModel: env.PLAN_MODEL?.trim() || DEFAULT_PLAN_MODEL,
      chatModel: env.CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL,
    },
  }
}

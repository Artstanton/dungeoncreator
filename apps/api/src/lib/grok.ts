import OpenAI from 'openai'

/**
 * Lazily-initialised Grok client.
 *
 * Static ES module imports are hoisted and evaluated before any module body
 * code runs — including the dotenv.config() call in index.ts. If we construct
 * the OpenAI client at module-load time, process.env.GROK_API_KEY is still
 * undefined. Deferring construction to first use (after dotenv has run) fixes
 * the 401 we'd otherwise get on every request.
 */
let _client: OpenAI | undefined

export function getGrok(): OpenAI {
  return (_client ??= new OpenAI({
    apiKey: process.env.GROK_API_KEY ?? '',
    baseURL: process.env.GROK_BASE_URL ?? 'https://api.x.ai/v1',
  }))
}

export function getModel(): string {
  const model = process.env.GROK_MODEL ?? 'grok-4-1-fast-reasoning'
  return model
}

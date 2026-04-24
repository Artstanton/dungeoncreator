import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import dotenv from 'dotenv'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import { pingResponse } from '@dungeon/shared'
import { campaignRoutes } from './routes/campaigns.js'
import { dungeonRoutes } from './routes/dungeons.js'

// Load .env from the monorepo root (three levels up from apps/api/src/index.ts).
// This runs before any env-reading code.
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../../.env') })

const app = Fastify({
  logger: {
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
  },
})

// CORS: dev-only permissive policy for localhost. Tightened in Phase 2.
await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      cb(null, true)
    } else {
      cb(new Error('CORS: origin not allowed'), false)
    }
  },
  credentials: true,
})

await app.register(sensible)
await app.register(campaignRoutes)
await app.register(dungeonRoutes)

// Health check. Shared schema lives in packages/shared so the web app can
// parse the response with the exact same Zod definition.
app.get('/api/ping', async () => {
  return pingResponse.parse({
    ok: true,
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  })
})

const port = Number(process.env.API_PORT ?? 4000)
const host = '127.0.0.1'

try {
  await app.listen({ port, host })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

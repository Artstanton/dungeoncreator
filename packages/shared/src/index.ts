import { z } from 'zod'

/**
 * Health-check response used by the web app in Phase 1 to verify the API is
 * reachable through Vite's dev proxy. Real schemas (User, Dungeon, Room, ...)
 * arrive in Phase 3.
 */
export const pingResponse = z.object({
  ok: z.literal(true),
  version: z.string(),
  timestamp: z.string(),
})

export type PingResponse = z.infer<typeof pingResponse>

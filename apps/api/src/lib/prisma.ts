import { PrismaClient } from '@prisma/client'

/**
 * Singleton Prisma client.
 *
 * `tsx watch` re-evaluates modules on file changes but keeps the Node process
 * alive. Without this pattern, each hot-reload would open a new DB connection.
 * Attaching the instance to `globalThis` lets subsequent re-evaluations reuse
 * the existing connection.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma
}

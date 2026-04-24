import { randomBytes } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { createDungeonInput, updateRoomInput } from '@dungeon/shared'
import { prisma } from '../lib/prisma.js'
import { generateDungeon, checkRateLimit } from '../lib/generate.js'
import { initProgress, updateProgress, finishProgress, getProgress } from '../lib/progress.js'

/** Deserialise a JSON-column value stored as a string. */
function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return [] as unknown as T
  }
}

export const dungeonRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /api/dungeons ───────────────────────────────────────────────────────
  app.get('/api/dungeons', async () => {
    const dungeons = await prisma.dungeon.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        campaign: { select: { id: true, name: true } },
        _count: { select: { levels: true } },
      },
    })

    return dungeons.map((d) => ({
      id: d.id,
      name: d.name,
      campaign: d.campaign,
      crMin: d.crMin,
      crMax: d.crMax,
      direction: d.direction,
      levelCount: d._count.levels,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }))
  })

  // ── GET /api/dungeons/:id ───────────────────────────────────────────────────
  // Returns the full dungeon detail including levels and rooms.
  app.get<{ Params: { id: string } }>('/api/dungeons/:id', async (req, reply) => {
    const dungeon = await prisma.dungeon.findUnique({
      where: { id: req.params.id },
      include: {
        campaign: true,
        levels: {
          orderBy: { index: 'asc' },
          include: {
            rooms: { orderBy: { index: 'asc' } },
          },
        },
      },
    })

    if (!dungeon) return reply.notFound('Dungeon not found.')

    return {
      id: dungeon.id,
      name: dungeon.name,
      campaignId: dungeon.campaignId,
      campaign: dungeon.campaign
        ? {
            id: dungeon.campaign.id,
            name: dungeon.campaign.name,
            createdAt: dungeon.campaign.createdAt.toISOString(),
            updatedAt: dungeon.campaign.updatedAt.toISOString(),
          }
        : null,
      theme: dungeon.theme,
      crMin: dungeon.crMin,
      crMax: dungeon.crMax,
      seed: dungeon.seed,
      direction: dungeon.direction,
      specificTreasures: parseJson<string[]>(dungeon.specificTreasures),
      specificEncounters: parseJson<string[]>(dungeon.specificEncounters),
      notes: dungeon.notes,
      createdAt: dungeon.createdAt.toISOString(),
      updatedAt: dungeon.updatedAt.toISOString(),
      levels: dungeon.levels.map((level) => ({
        id: level.id,
        index: level.index,
        name: level.name,
        roomCount: level.roomCount,
        mapData: level.mapData,
        createdAt: level.createdAt.toISOString(),
        rooms: level.rooms.map((room) => ({
          id: room.id,
          index: room.index,
          name: room.name,
          description: room.description,
          encounters: parseJson<string[]>(room.encounters),
          treasure: parseJson<string[]>(room.treasure),
          secrets: room.secrets,
          hooks: room.hooks,
          createdAt: room.createdAt.toISOString(),
        })),
      })),
    }
  })

  // ── POST /api/dungeons ──────────────────────────────────────────────────────
  // Creates the dungeon record, fires generation in the background, and returns
  // immediately with the new dungeon id.  The client polls GET ./:id/progress.
  app.post('/api/dungeons', async (req, reply) => {
    const body = createDungeonInput.safeParse(req.body)
    if (!body.success) {
      return reply.badRequest(body.error.issues.map((i) => i.message).join(', '))
    }

    const {
      campaignId,
      campaignName,
      seed,
      specificTreasures,
      specificEncounters,
      floorCount,
      roomsMin,
      roomsMax,
      randomize,
      ...rest
    } = body.data

    // Resolve campaign.
    let resolvedCampaignId: string | null = null
    if (campaignId) {
      const exists = await prisma.campaign.findUnique({ where: { id: campaignId } })
      if (!exists) return reply.badRequest(`Campaign "${campaignId}" not found.`)
      resolvedCampaignId = campaignId
    } else if (campaignName) {
      const campaign = await prisma.campaign.upsert({
        where: { name: campaignName },
        update: {},
        create: { name: campaignName },
      })
      resolvedCampaignId = campaign.id
    }

    // Create the dungeon record.
    const dungeon = await prisma.dungeon.create({
      data: {
        ...rest,
        campaignId: resolvedCampaignId,
        seed: seed ?? randomBytes(8).toString('hex'),
        specificTreasures: JSON.stringify(specificTreasures),
        specificEncounters: JSON.stringify(specificEncounters),
      },
    })

    // Initialise progress entry so the client can start polling immediately.
    initProgress(dungeon.id)

    // Check rate limit — if hit, mark done immediately with an error message.
    if (!checkRateLimit()) {
      finishProgress(dungeon.id, [
        'Rate limit reached (5 generations per minute). The dungeon record was saved — try generating again in a moment.',
      ])
      reply.status(202)
      return { id: dungeon.id }
    }

    // Capture values needed by the background task before the handler returns.
    const genParams = {
      dungeonName: dungeon.name,
      theme: dungeon.theme ?? undefined,
      crMin: dungeon.crMin,
      crMax: dungeon.crMax,
      seed: dungeon.seed,
      direction: dungeon.direction,
      floorCount,
      roomsMin,
      roomsMax,
      specificEncounters: parseJson<string[]>(dungeon.specificEncounters),
      specificTreasures: parseJson<string[]>(dungeon.specificTreasures),
      randomize,
    }
    const dungeonId = dungeon.id

    // Fire generation in the background — do not await.
    void (async () => {
      const errors: string[] = []
      try {
        const result = await generateDungeon(
          dungeonId,
          genParams,
          (floorsComplete, floorsTotal) => updateProgress(dungeonId, floorsComplete, floorsTotal),
        )
        for (const level of result.levels) {
          if (level.status === 'error') {
            errors.push(`${level.name}: ${level.error ?? 'generation failed'}`)
          }
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'Generation failed unexpectedly.')
      }
      finishProgress(dungeonId, errors)
    })()

    reply.status(202)
    return { id: dungeon.id }
  })

  // ── GET /api/dungeons/:id/progress ─────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/dungeons/:id/progress', async (req, reply) => {
    const progress = getProgress(req.params.id)

    if (progress) return progress

    // No in-memory entry: either generation finished long ago (server was not
    // restarted) or the dungeon doesn't exist.  Check the DB.
    const dungeon = await prisma.dungeon.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { levels: true } } },
    })
    if (!dungeon) return reply.notFound('Dungeon not found.')

    // Treat an existing dungeon with levels as fully generated.
    const n = dungeon._count.levels
    return { floorsComplete: n, floorsTotal: n, done: true, errors: [] }
  })

  // ── PATCH /api/rooms/:id ────────────────────────────────────────────────────
  // Partial update of a single room's content fields.
  app.patch<{ Params: { id: string } }>('/api/rooms/:id', async (req, reply) => {
    const body = updateRoomInput.safeParse(req.body)
    if (!body.success) {
      return reply.badRequest(body.error.issues.map((i) => i.message).join(', '))
    }

    const existing = await prisma.room.findUnique({ where: { id: req.params.id } })
    if (!existing) return reply.notFound('Room not found.')

    const { encounters, treasure, ...rest } = body.data

    const updated = await prisma.room.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(encounters !== undefined ? { encounters: JSON.stringify(encounters) } : {}),
        ...(treasure  !== undefined ? { treasure:  JSON.stringify(treasure)  } : {}),
      },
    })

    return {
      id: updated.id,
      index: updated.index,
      name: updated.name,
      description: updated.description,
      encounters: parseJson<string[]>(updated.encounters),
      treasure:   parseJson<string[]>(updated.treasure),
      secrets:  updated.secrets,
      hooks:    updated.hooks,
      createdAt: updated.createdAt.toISOString(),
    }
  })
}

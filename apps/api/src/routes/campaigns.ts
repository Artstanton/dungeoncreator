import type { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { createCampaignInput } from '@dungeon/shared'
import { prisma } from '../lib/prisma.js'

export const campaignRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /api/campaigns ──────────────────────────────────────────────────────
  app.get('/api/campaigns', async () => {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { dungeons: true } } },
    })

    return campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      dungeonCount: c._count.dungeons,
    }))
  })

  // ── POST /api/campaigns ─────────────────────────────────────────────────────
  app.post('/api/campaigns', async (req, reply) => {
    const body = createCampaignInput.safeParse(req.body)
    if (!body.success) {
      return reply.badRequest(body.error.issues.map((i) => i.message).join(', '))
    }

    try {
      const campaign = await prisma.campaign.create({ data: body.data })
      reply.status(201)
      return {
        id: campaign.id,
        name: campaign.name,
        createdAt: campaign.createdAt.toISOString(),
        updatedAt: campaign.updatedAt.toISOString(),
        dungeonCount: 0,
      }
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return reply.conflict(`A campaign named "${body.data.name}" already exists.`)
      }
      throw err
    }
  })

  // ── GET /api/campaigns/:id ──────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/campaigns/:id', async (req, reply) => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        dungeons: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            crMin: true,
            crMax: true,
            direction: true,
            createdAt: true,
          },
        },
      },
    })

    if (!campaign) return reply.notFound('Campaign not found.')

    return {
      id: campaign.id,
      name: campaign.name,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      dungeons: campaign.dungeons.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      })),
    }
  })
}

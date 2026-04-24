/**
 * Seed script — populates the local SQLite DB with enough data to smoke-test
 * the Phase 2 routes without touching the real Grok API.
 *
 * Run:  pnpm --filter @dungeon/api exec prisma db seed
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database…')

  // ── Campaigns ──────────────────────────────────────────────────────────────

  const ironThroneHollow = await prisma.campaign.upsert({
    where: { name: 'Iron Throne Hollow' },
    update: {},
    create: { name: 'Iron Throne Hollow' },
  })

  const lostCaverns = await prisma.campaign.upsert({
    where: { name: 'The Lost Caverns' },
    update: {},
    create: { name: 'The Lost Caverns' },
  })

  console.log(`  ✓ campaign: ${ironThroneHollow.name}`)
  console.log(`  ✓ campaign: ${lostCaverns.name}`)

  // ── Sample dungeon (no AI content — placeholder text) ──────────────────────

  const existingDungeon = await prisma.dungeon.findFirst({
    where: { name: 'Tomb of the Hollow King' },
  })

  if (!existingDungeon) {
    const dungeon = await prisma.dungeon.create({
      data: {
        name: 'Tomb of the Hollow King',
        campaignId: ironThroneHollow.id,
        theme: 'Ancient undead crypt beneath a ruined keep',
        crMin: 3,
        crMax: 6,
        seed: 'hollow-king-001',
        direction: 'down',
        specificTreasures: JSON.stringify(['Crown of the Hollow King', 'Bag of holding']),
        specificEncounters: JSON.stringify(['Lich (weakened)', 'Skeleton warriors']),
        notes: 'Seed dungeon created by the Phase 2 seed script.',
        levels: {
          create: [
            {
              index: 0,
              name: 'The Entry Vault',
              roomCount: 4,
              mapData: JSON.stringify({ placeholder: true, width: 0, height: 0, rooms: [], corridors: [] }),
              rooms: {
                create: [
                  {
                    index: 0,
                    name: 'Gatehouse',
                    description: 'A heavy iron portcullis guards the entry. Moss-covered stone walls weep with moisture.',
                    encounters: JSON.stringify(['2x Skeleton Guard']),
                    treasure: JSON.stringify(['10 gp', 'Iron key']),
                    secrets: 'A loose flagstone conceals a crawlspace leading to Room 2.',
                    hooks: 'The skeletons bear a crest matching the party\'s contact.',
                  },
                  {
                    index: 1,
                    name: 'Guard Barracks',
                    description: 'Rotting bunks line the walls. A war drum sits cracked in the corner.',
                    encounters: JSON.stringify(['4x Skeleton Guard']),
                    treasure: JSON.stringify(['Shield +1', '25 gp in scattered coins']),
                  },
                ],
              },
            },
            {
              index: -1,
              name: 'The Crypt',
              roomCount: 6,
              mapData: JSON.stringify({ placeholder: true, width: 0, height: 0, rooms: [], corridors: [] }),
              rooms: {
                create: [
                  {
                    index: 0,
                    name: 'Ossuary',
                    description: 'Floor-to-ceiling bone niches. The air smells of old iron.',
                    encounters: JSON.stringify([]),
                    treasure: JSON.stringify(['Spell scroll: Speak with Dead']),
                  },
                ],
              },
            },
          ],
        },
      },
    })

    console.log(`  ✓ dungeon: ${dungeon.name} (${dungeon.id})`)
  } else {
    console.log(`  ↩ dungeon already exists: ${existingDungeon.name}`)
  }

  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

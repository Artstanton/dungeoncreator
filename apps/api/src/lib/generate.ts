import OpenAI from 'openai'
import { z } from 'zod'
import { getGrok, getModel } from './grok.js'
import { prisma } from './prisma.js'
import { generateMap } from './map.js'
import type { RandomizeFlags } from '@dungeon/shared'

// ─── AI response schemas ──────────────────────────────────────────────────────

const grokRoomSchema = z.object({
  // Reasoning models often return null instead of omitting optional fields.
  // Use nullish() / nullable() + transforms throughout to handle this gracefully.
  name: z.string().nullable().transform((v) => v ?? 'Unnamed Room'),
  description: z.string().nullable().transform((v) => v ?? 'No description provided.'),
  encounters: z.array(z.string()).nullable().default([]).transform((v) => v ?? []),
  treasure: z.array(z.string()).nullable().default([]).transform((v) => v ?? []),
  secrets: z.string().nullish().transform((v) => v ?? undefined),
  hooks: z.string().nullish().transform((v) => v ?? undefined),
})

const grokLevelResponseSchema = z.object({
  levelName: z.string().optional(),
  rooms: z.array(grokRoomSchema).min(1),
})

const grokRandomFieldsSchema = z.object({
  theme: z.string().optional(),
  crMin: z.number().int().min(0).max(30).optional(),
  crMax: z.number().int().min(0).max(30).optional(),
  floorCount: z.number().int().min(1).max(10).optional(),
  roomsMin: z.number().int().min(1).max(20).optional(),
  roomsMax: z.number().int().min(1).max(20).optional(),
})

// ─── Rate limiter (simple sliding window) ────────────────────────────────────

const RATE_WINDOW_MS = 60_000
const MAX_PER_WINDOW = 5
const requestLog: number[] = []

export function checkRateLimit(): boolean {
  const now = Date.now()
  const cutoff = now - RATE_WINDOW_MS
  while (requestLog.length > 0 && (requestLog[0] ?? 0) < cutoff) {
    requestLog.shift()
  }
  if (requestLog.length >= MAX_PER_WINDOW) return false
  requestLog.push(now)
  return true
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const message = err instanceof Error ? err.message : String(err)
      // Auth/permission errors won't improve on retry — fail fast.
      if (err instanceof OpenAI.APIError && (err.status === 401 || err.status === 403)) {
        console.error(`[generate] Grok auth error (${err.status}): ${message}`)
        throw err
      }
      const delay = Math.pow(2, i) * 1000
      console.error(`[generate] Attempt ${i + 1}/${maxAttempts} failed: ${message}${i < maxAttempts - 1 ? ` — retrying in ${delay / 1000}s` : ' — giving up'}`)
      if (i < maxAttempts - 1) {
        await sleep(delay)
      }
    }
  }
  throw lastErr
}

// ─── JSON extraction ──────────────────────────────────────────────────────────
// Grok sometimes wraps JSON in markdown code fences; strip them.

function extractJson(text: string): string {
  const match = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (match?.[1]) return match[1].trim()
  return text.trim()
}

// ─── Random field resolution ──────────────────────────────────────────────────

interface ResolvedParams {
  theme: string | undefined
  crMin: number
  crMax: number
  floorCount: number
  roomsMin: number
  roomsMax: number
}

/**
 * For any fields the user toggled Random, ask Grok to pick values.
 * Falls back to the provided defaults if parsing fails.
 */
export async function resolveRandomFields(
  dungeonName: string,
  provided: ResolvedParams,
  randomize: RandomizeFlags,
): Promise<ResolvedParams> {
  const needsResolution =
    randomize.theme || randomize.cr || randomize.floorCount || randomize.roomsPerFloor
  if (!needsResolution) return provided

  const wantedLines: string[] = []
  if (randomize.theme) {
    wantedLines.push('- theme: evocative string describing the dungeon mood and aesthetic')
  }
  if (randomize.cr) {
    wantedLines.push('- crMin: integer 0–20')
    wantedLines.push('- crMax: integer (crMin + 2 to crMin + 8)')
  }
  if (randomize.floorCount) wantedLines.push('- floorCount: integer 1–5')
  if (randomize.roomsPerFloor) {
    wantedLines.push('- roomsMin: integer 2–6 (minimum rooms on any floor)')
    wantedLines.push('- roomsMax: integer (roomsMin + 3 to roomsMin + 8, maximum rooms on any floor)')
  }

  const userPrompt = [
    `Dungeon: "${dungeonName}"`,
    provided.theme ? `Theme hint: ${provided.theme}` : '',
    '',
    'Return a JSON object containing only these fields:',
    ...wantedLines,
  ]
    .filter(Boolean)
    .join('\n')

  const raw = await withRetry(async () => {
    const res = await getGrok().chat.completions.create({
      model: getModel(),
      messages: [
        {
          role: 'system',
          content:
            'You are a dungeon master designing a tabletop RPG dungeon. Respond only with valid JSON.',
        },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
      temperature: 0.9,
    })
    const content = res.choices[0]?.message?.content
    if (!content) throw new Error('Empty response from Grok')
    return content
  })

  let parsed: z.infer<typeof grokRandomFieldsSchema> | null = null
  try {
    const json = JSON.parse(extractJson(raw)) as unknown
    const result = grokRandomFieldsSchema.safeParse(json)
    if (result.success) parsed = result.data
  } catch {
    // Fall back to provided values if the response is unparseable.
  }

  if (!parsed) return provided

  const crMin =
    randomize.cr && parsed.crMin !== undefined ? parsed.crMin : provided.crMin
  const crMax =
    randomize.cr && parsed.crMax !== undefined
      ? Math.max(parsed.crMax, crMin + 1) // ensure crMax > crMin
      : provided.crMax

  const roomsMin =
    randomize.roomsPerFloor && parsed.roomsMin !== undefined
      ? parsed.roomsMin
      : provided.roomsMin
  const roomsMax =
    randomize.roomsPerFloor && parsed.roomsMax !== undefined
      ? Math.max(parsed.roomsMax, roomsMin + 1)
      : provided.roomsMax

  return {
    theme: randomize.theme && parsed.theme ? parsed.theme : provided.theme,
    crMin,
    crMax,
    floorCount:
      randomize.floorCount && parsed.floorCount !== undefined
        ? parsed.floorCount
        : provided.floorCount,
    roomsMin,
    roomsMax,
  }
}

// ─── Level generation ─────────────────────────────────────────────────────────

interface GenerateLevelParams {
  dungeonName: string
  theme: string
  crMin: number
  crMax: number
  direction: string
  levelIndex: number
  floorCount: number
  roomsMin: number
  roomsMax: number
  specificEncounters: string[]
  specificTreasures: string[]
  previousLevelSummary?: string
}

interface GeneratedLevel {
  levelName: string
  rooms: Array<{
    name: string
    description: string
    encounters: string[]
    treasure: string[]
    secrets?: string
    hooks?: string
  }>
  rawResponse: string
}

async function generateLevel(params: GenerateLevelParams): Promise<GeneratedLevel> {
  const dirLabel =
    params.direction === 'up'
      ? `floor ${params.levelIndex + 1} of ${params.floorCount} (ascending)`
      : params.direction === 'down'
        ? `floor ${params.levelIndex + 1} of ${params.floorCount} (descending into the earth)`
        : `floor ${params.levelIndex + 1} of ${params.floorCount}`

  const encounterInstruction =
    params.specificEncounters.length > 0
      ? `Must place somewhere across all rooms (distribute naturally): ${params.specificEncounters.join(', ')}.`
      : 'Choose appropriate encounters for the challenge rating.'

  const treasureInstruction =
    params.specificTreasures.length > 0
      ? `Must place somewhere across all rooms (distribute naturally): ${params.specificTreasures.join(', ')}.`
      : 'Choose appropriate treasure for the challenge rating.'

  const prompt = [
    'You are a dungeon master writing room content for a tabletop RPG dungeon.',
    '',
    `Dungeon: "${params.dungeonName}"`,
    `Theme: ${params.theme}`,
    `Challenge Rating: ${params.crMin}–${params.crMax}`,
    `Location: ${dirLabel}`,
    params.previousLevelSummary ? `Previous floor: ${params.previousLevelSummary}` : '',
    '',
    `Generate between ${params.roomsMin} and ${params.roomsMax} rooms for this floor. Choose a count that fits the level's character — entry halls and antechambers tend toward fewer rooms; sprawling crypts and barracks toward more.`,
    `Encounters: ${encounterInstruction}`,
    `Treasure: ${treasureInstruction}`,
    '',
    'Return a JSON object with:',
    '- levelName: a short evocative name for this floor (e.g. "The Ossuary", "Guard Barracks")',
    `- rooms: array of ${params.roomsMin}–${params.roomsMax} objects, each with:`,
    '  - name: short room name (2–4 words)',
    '  - description: 2–3 sentences read aloud when players enter (second-person present tense)',
    '  - encounters: string[] (can be empty)',
    '  - treasure: string[] (can be empty)',
    '  - secrets: string — a hidden feature players might discover (omit if none)',
    '  - hooks: string — a plot hook connecting to the wider dungeon (omit if mundane)',
    '',
    'Be specific and evocative. Return only valid JSON.',
  ]
    .filter(Boolean)
    .join('\n')

  return await withRetry(async () => {
    const res = await getGrok().chat.completions.create({
      model: getModel(),
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
      temperature: 0.85,
    })

    const content = res.choices[0]?.message?.content
    if (!content) throw new Error('Empty response from Grok')

    let json: unknown
    try {
      json = JSON.parse(extractJson(content))
    } catch {
      throw new Error('Grok returned malformed JSON — will retry')
    }

    const parsed = grokLevelResponseSchema.safeParse(json)
    if (!parsed.success) {
      throw new Error(
        `Unexpected response shape: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      )
    }

    return {
      levelName: parsed.data.levelName ?? `Floor ${params.levelIndex + 1}`,
      rooms: parsed.data.rooms.slice(0, params.roomsMax),
      rawResponse: content,
    }
  })
}

// ─── Floor index mapping ──────────────────────────────────────────────────────

function toFloorIndex(generationIndex: number, direction: string): number {
  if (direction === 'up') return generationIndex // 0, 1, 2, …
  if (direction === 'down') return -generationIndex // 0, -1, -2, …
  // 'both': alternate down/up — 0, -1, 1, -2, 2, …
  if (generationIndex === 0) return 0
  const half = Math.ceil(generationIndex / 2)
  return generationIndex % 2 === 1 ? -half : half
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export interface LevelGenerationResult {
  id: string
  index: number
  name: string
  roomCount: number
  status: 'ok' | 'error'
  error?: string
}

export interface GenerationResult {
  resolvedTheme: string | undefined
  resolvedCrMin: number
  resolvedCrMax: number
  levels: LevelGenerationResult[]
}

export async function generateDungeon(
  dungeonId: string,
  params: {
    dungeonName: string
    theme?: string
    crMin: number
    crMax: number
    seed: string
    direction: string
    floorCount: number
    roomsMin: number
    roomsMax: number
    specificEncounters: string[]
    specificTreasures: string[]
    randomize?: RandomizeFlags
  },
  onProgress?: (floorsComplete: number, floorsTotal: number) => void,
): Promise<GenerationResult> {
  const emptyRandomize: RandomizeFlags = {
    theme: false,
    cr: false,
    floorCount: false,
    roomsPerFloor: false,
    specificEncounters: false,
    specificTreasures: false,
  }

  // Step 1 — Resolve any AI-decided fields.
  const resolved = await resolveRandomFields(
    params.dungeonName,
    {
      theme: params.theme,
      crMin: params.crMin,
      crMax: params.crMax,
      floorCount: params.floorCount,
      roomsMin: params.roomsMin,
      roomsMax: params.roomsMax,
    },
    params.randomize ?? emptyRandomize,
  )

  // Total floors now known — report 0 complete so the client can show a bar.
  onProgress?.(0, resolved.floorCount)

  // Persist resolved values back to the dungeon record so they're reproducible.
  await prisma.dungeon.update({
    where: { id: dungeonId },
    data: {
      theme: resolved.theme ?? null,
      crMin: resolved.crMin,
      crMax: resolved.crMax,
    },
  })

  // Step 2 — Generate each floor sequentially.
  // Each level's summary is fed to the next as a coherence hint.
  const levelResults: LevelGenerationResult[] = []
  let prevSummary: string | undefined

  for (let i = 0; i < resolved.floorCount; i++) {
    try {
      const levelData = await generateLevel({
        dungeonName: params.dungeonName,
        theme: resolved.theme ?? 'classic fantasy dungeon',
        crMin: resolved.crMin,
        crMax: resolved.crMax,
        direction: params.direction,
        levelIndex: i,
        floorCount: resolved.floorCount,
        roomsMin: resolved.roomsMin,
        roomsMax: resolved.roomsMax,
        specificEncounters: params.specificEncounters,
        specificTreasures: params.specificTreasures,
        previousLevelSummary: prevSummary,
      })

      const floorIndex = toFloorIndex(i, params.direction)

      // Generate the algorithmic map layout for this level.
      const mapData = generateMap({
        seed: `${params.seed ?? 'dungeon'}-level-${i}`,
        roomCount: levelData.rooms.length,
        direction: params.direction,
        isEntry: i === 0,
        hasLevelAbove: params.direction === 'down'
          ? i > 0
          : params.direction === 'up'
            ? i < resolved.floorCount - 1
            : i > 0,
        hasLevelBelow: params.direction === 'down'
          ? i < resolved.floorCount - 1
          : params.direction === 'up'
            ? i > 0
            : i < resolved.floorCount - 1,
      })

      // Save level + all rooms in a single transaction.
      const level = await prisma.level.create({
        data: {
          dungeonId,
          index: floorIndex,
          name: levelData.levelName,
          roomCount: levelData.rooms.length,
          mapData: JSON.stringify(mapData),
          rooms: {
            create: levelData.rooms.map((room, roomIndex) => ({
              index: roomIndex,
              name: room.name,
              description: room.description,
              encounters: JSON.stringify(room.encounters),
              treasure: JSON.stringify(room.treasure),
              secrets: room.secrets ?? null,
              hooks: room.hooks ?? null,
              // Store the full Grok response verbatim on each room for
              // debug / replay without re-paying the API.
              rawAiResponse: levelData.rawResponse,
            })),
          },
        },
      })

      prevSummary = `${levelData.levelName}: ${levelData.rooms.map((r) => r.name).join(', ')}`

      levelResults.push({
        id: level.id,
        index: floorIndex,
        name: level.name,
        roomCount: levelData.rooms.length,
        status: 'ok',
      })
    } catch (err) {
      // Partial save: record the error and continue with the next floor.
      const message = err instanceof Error ? err.message : String(err)
      levelResults.push({
        id: '',
        index: toFloorIndex(i, params.direction),
        name: `Floor ${i + 1}`,
        roomCount: 0,
        status: 'error',
        error: message,
      })
    }

    // Report progress after each floor attempt (success or failure).
    onProgress?.(i + 1, resolved.floorCount)
  }

  return {
    resolvedTheme: resolved.theme,
    resolvedCrMin: resolved.crMin,
    resolvedCrMax: resolved.crMax,
    levels: levelResults,
  }
}

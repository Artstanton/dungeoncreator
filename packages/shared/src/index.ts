import { z } from 'zod'

// ─── Phase 1: health check ────────────────────────────────────────────────────

/**
 * Health-check response — lets the web app verify the API is reachable through
 * Vite's dev proxy.
 */
export const pingResponse = z.object({
  ok: z.literal(true),
  version: z.string(),
  timestamp: z.string(),
})

export type PingResponse = z.infer<typeof pingResponse>

// ─── Phase 2: campaigns ───────────────────────────────────────────────────────

export const campaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Campaign = z.infer<typeof campaignSchema>

/** Shape returned from GET /api/campaigns (includes a precomputed count). */
export const campaignListItemSchema = campaignSchema.extend({
  dungeonCount: z.number().int().nonnegative(),
})

export type CampaignListItem = z.infer<typeof campaignListItemSchema>

export const createCampaignInput = z.object({
  name: z.string().min(1, 'Name is required').max(100),
})

export type CreateCampaignInput = z.infer<typeof createCampaignInput>

// ─── Phase 2: dungeons ────────────────────────────────────────────────────────

export const directionSchema = z.enum(['up', 'down', 'both'])
export type Direction = z.infer<typeof directionSchema>

export const dungeonSchema = z.object({
  id: z.string(),
  name: z.string(),
  campaignId: z.string().nullable(),
  theme: z.string().nullable(),
  crMin: z.number().int().min(0).max(30),
  crMax: z.number().int().min(0).max(30),
  seed: z.string(),
  direction: directionSchema,
  /** 1 = sprawling (long corridors), 3 = normal, 5 = compact (tight rooms) */
  density: z.number().int().min(1).max(5).default(3),
  specificTreasures: z.array(z.string()),
  specificEncounters: z.array(z.string()),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Dungeon = z.infer<typeof dungeonSchema>

// ─── Phase 3: randomize flags ─────────────────────────────────────────────────

/**
 * Tells the generation layer which fields the user wants the AI to decide.
 * Ignored in Phase 3 (stub); consumed in Phase 4 (Grok generation).
 */
export const randomizeFlagsSchema = z.object({
  theme:              z.boolean().default(false),
  cr:                 z.boolean().default(false),
  floorCount:         z.boolean().default(false),
  roomsPerFloor:      z.boolean().default(false),
  specificEncounters: z.boolean().default(false),
  specificTreasures:  z.boolean().default(false),
}).default({})

export type RandomizeFlags = z.infer<typeof randomizeFlagsSchema>

export const createDungeonInput = z.object({
  name: z.string().min(1, 'Name is required'),
  /** Existing campaign id, a new campaign name, or omitted for no campaign. */
  campaignId: z.string().optional(),
  campaignName: z.string().min(1).optional(),
  theme: z.string().optional(),
  crMin: z.number().int().min(0).max(30).default(1),
  crMax: z.number().int().min(0).max(30).default(5),
  seed: z.string().optional(), // generated server-side if omitted
  direction: directionSchema.default('down'),
  /** 1 = sprawling, 2 = open, 3 = normal, 4 = dense, 5 = compact */
  density: z.number().int().min(1).max(5).default(3),
  specificTreasures: z.array(z.string()).default([]),
  specificEncounters: z.array(z.string()).default([]),
  notes: z.string().optional(),
  /** How many floors to generate. AI decides if randomize.floorCount is true. */
  floorCount: z.number().int().min(1).max(10).default(1),
  /** Min rooms per floor. AI decides if randomize.roomsPerFloor is true. */
  roomsMin: z.number().int().min(1).max(30).default(4),
  /** Max rooms per floor. AI decides if randomize.roomsPerFloor is true. */
  roomsMax: z.number().int().min(1).max(30).default(10),
  /** Which fields the AI should decide. Consumed by the generation layer (Phase 4). */
  randomize: randomizeFlagsSchema.optional(),
})

export type CreateDungeonInput = z.infer<typeof createDungeonInput>

// ─── Phase 4: rooms and levels ───────────────────────────────────────────────

export const roomSchema = z.object({
  id: z.string(),
  index: z.number().int(),
  name: z.string(),
  description: z.string(),
  encounters: z.array(z.string()),
  treasure: z.array(z.string()),
  secrets: z.string().nullable(),
  hooks: z.string().nullable(),
  createdAt: z.string().datetime(),
})

export type Room = z.infer<typeof roomSchema>

export const levelDetailSchema = z.object({
  id: z.string(),
  index: z.number().int(),
  name: z.string(),
  roomCount: z.number().int(),
  rooms: z.array(roomSchema),
  /** Raw JSON string of MapData, as stored in the DB. */
  mapData: z.string().optional(),
  createdAt: z.string().datetime(),
})

export type LevelDetail = z.infer<typeof levelDetailSchema>

// ─── Phase 2 → Phase 4: dungeon detail (with full levels + rooms) ─────────────

export const dungeonDetailSchema = dungeonSchema.extend({
  campaign: campaignSchema.nullable(),
  levels: z.array(levelDetailSchema),
})

export type DungeonDetail = z.infer<typeof dungeonDetailSchema>

// ─── Phase 4: POST /api/dungeons response ─────────────────────────────────────

/** The dungeon record plus any level generation errors (empty array = full success). */
export const createDungeonResponse = dungeonSchema.extend({
  generationErrors: z.array(z.string()),
})

export type CreateDungeonResponse = z.infer<typeof createDungeonResponse>

// ─── Phase 6: generation progress ────────────────────────────────────────────

/** Returned immediately by POST /api/dungeons (generation runs in background). */
export const createDungeonStartResponse = z.object({ id: z.string() })
export type CreateDungeonStartResponse = z.infer<typeof createDungeonStartResponse>

/** Polled by the client while generation is in progress. */
export const dungeonProgressSchema = z.object({
  floorsComplete: z.number().int(),
  /** 0 = resolving random fields; positive = total floors to generate. */
  floorsTotal:    z.number().int(),
  done:   z.boolean(),
  errors: z.array(z.string()),
})
export type DungeonProgress = z.infer<typeof dungeonProgressSchema>

// ─── Phase 6: room editing ────────────────────────────────────────────────────

export const updateRoomInput = z.object({
  name:        z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  encounters:  z.array(z.string()).optional(),
  treasure:    z.array(z.string()).optional(),
  secrets:     z.string().nullable().optional(),
  hooks:       z.string().nullable().optional(),
})

export type UpdateRoomInput = z.infer<typeof updateRoomInput>

// ─── Phase 5: map data ────────────────────────────────────────────────────────

/** A single room's position and size on the tile grid. */
export const mapRoomSchema = z.object({
  /** Matches room.index — used to link SVG cells to room content. */
  id: z.number().int(),
  x: z.number().int(),   // left edge (tiles)
  y: z.number().int(),   // top edge (tiles)
  w: z.number().int(),   // width (tiles)
  h: z.number().int(),   // height (tiles)
})

export type MapRoom = z.infer<typeof mapRoomSchema>

/** One segment of a corridor, described as an ordered list of [x, y] tile coords. */
export const corridorSchema = z.object({
  fromRoom: z.number().int(),
  toRoom: z.number().int(),
  /** Every tile on this corridor path, in order. */
  tiles: z.array(z.tuple([z.number().int(), z.number().int()])),
})

export type Corridor = z.infer<typeof corridorSchema>

/** A stair icon placed at a specific tile to indicate level transitions. */
export const stairMarkerSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  /** 'up' or 'down' relative to this level. */
  direction: z.enum(['up', 'down']),
})

export type StairMarker = z.infer<typeof stairMarkerSchema>

/**
 * Full map layout for one dungeon level.
 * Stored as JSON in level.mapData.
 */
export const mapDataSchema = z.object({
  /** Total grid width in tiles. */
  width: z.number().int(),
  /** Total grid height in tiles. */
  height: z.number().int(),
  rooms: z.array(mapRoomSchema),
  corridors: z.array(corridorSchema),
  stairs: z.array(stairMarkerSchema),
})

export type MapData = z.infer<typeof mapDataSchema>

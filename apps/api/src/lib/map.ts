/**
 * Algorithmic dungeon map generator.
 *
 * Produces a MapData layout for one dungeon level from a seed string and
 * room count.  Deterministic: same seed + roomCount always yields the same map.
 *
 * Algorithm (from CONTEXT.md spec):
 *  1. Place rooms one at a time on a tile grid.
 *     - First room: centered in the canvas.
 *     - Each subsequent room: pick a random already-placed room, pick a random
 *       cardinal direction, walk outward until we find space for the new room
 *       (including a 1-tile gap for a corridor), collision-check via an
 *       occupancy grid.
 *  2. Connect each new room to its parent with an L-shaped orthogonal corridor.
 *  3. Post-process: BFS from room 0; any disconnected rooms get an extra
 *     corridor to the nearest connected room.
 *  4. Shrink the canvas to the bounding box of all content and return MapData.
 *
 * Room sizing uses hints from the room index:
 *   - Room 0 (entrance): slightly larger, placed first.
 *   - Last room: slightly larger, placed last.
 *   - Others: random within a mid-size range.
 */

import seedrandom from 'seedrandom'
import type { MapData, MapRoom, Corridor, StairMarker } from '@dungeon/shared'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Pixel size of one tile in the SVG viewport (used only as a rendering hint). */
export const TILE_PX = 22

/**
 * Gap range (min tiles, max tiles) between room edges per density level.
 * density 1 = sprawling cave (long corridors)
 * density 3 = normal (current default)
 * density 5 = compact fortress (rooms nearly touching)
 */
const GAP_BY_DENSITY: Record<number, [number, number]> = {
  1: [8, 14],
  2: [4, 8],
  3: [2, 4],
  4: [1, 2],
  5: [1, 1],
}

/** Canvas size allocated for placement (rooms stay within this). */
const CANVAS = 80

/** How many placement attempts before giving up on a room. */
const MAX_ATTEMPTS = 200

// ─── RNG helpers ──────────────────────────────────────────────────────────────

function randInt(rng: seedrandom.PRNG, min: number, max: number): number {
  // inclusive both ends
  return Math.floor(rng() * (max - min + 1)) + min
}

function pick<T>(rng: seedrandom.PRNG, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)] as T
}

// ─── Occupancy grid ───────────────────────────────────────────────────────────

class Grid {
  private cells: Uint8Array
  readonly width: number
  readonly height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.cells = new Uint8Array(width * height)
  }

  private idx(x: number, y: number): number {
    return y * this.width + x
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height
  }

  get(x: number, y: number): number {
    return this.inBounds(x, y) ? (this.cells[this.idx(x, y)] ?? 0) : 1
  }

  set(x: number, y: number, val: number): void {
    if (this.inBounds(x, y)) this.cells[this.idx(x, y)] = val
  }

  /** Mark a rectangular region. val=1 → occupied, val=2 → corridor. */
  fill(x: number, y: number, w: number, h: number, val: number): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.set(x + dx, y + dy, val)
      }
    }
  }

  /** True if every cell in the rect is unoccupied (val === 0). */
  isFree(x: number, y: number, w: number, h: number): boolean {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (this.get(x + dx, y + dy) !== 0) return false
      }
    }
    return true
  }
}

// ─── Room sizing ──────────────────────────────────────────────────────────────

interface SizeHint {
  minW: number
  maxW: number
  minH: number
  maxH: number
}

function sizeHint(roomIndex: number, totalRooms: number): SizeHint {
  if (roomIndex === 0) {
    // Entrance: larger
    return { minW: 5, maxW: 8, minH: 5, maxH: 8 }
  }
  if (roomIndex === totalRooms - 1) {
    // Boss / final room: large
    return { minW: 6, maxW: 10, minH: 6, maxH: 10 }
  }
  // Regular rooms
  return { minW: 3, maxW: 7, minH: 3, maxH: 6 }
}

// ─── Corridor routing ─────────────────────────────────────────────────────────

/**
 * Returns all [x, y] tiles of an L-shaped path between the centres of two
 * rooms.  The bend point is chosen randomly (horizontal-first or
 * vertical-first) and avoids going through other rooms where possible.
 */
function routeCorridor(
  a: MapRoom,
  b: MapRoom,
  rng: seedrandom.PRNG,
): Array<[number, number]> {
  // Use room centres
  const ax = Math.floor(a.x + a.w / 2)
  const ay = Math.floor(a.y + a.h / 2)
  const bx = Math.floor(b.x + b.w / 2)
  const by = Math.floor(b.y + b.h / 2)

  const tiles: Array<[number, number]> = []

  const horizontal = rng() < 0.5

  if (horizontal) {
    // Walk along x first, then y
    const minX = Math.min(ax, bx)
    const maxX = Math.max(ax, bx)
    for (let x = minX; x <= maxX; x++) tiles.push([x, ay])
    const minY = Math.min(ay, by)
    const maxY = Math.max(ay, by)
    for (let y = minY; y <= maxY; y++) {
      if (!tiles.some(([tx, ty]) => tx === bx && ty === y)) {
        tiles.push([bx, y])
      }
    }
  } else {
    // Walk along y first, then x
    const minY = Math.min(ay, by)
    const maxY = Math.max(ay, by)
    for (let y = minY; y <= maxY; y++) tiles.push([ax, y])
    const minX = Math.min(ax, bx)
    const maxX = Math.max(ax, bx)
    for (let x = minX; x <= maxX; x++) {
      if (!tiles.some(([tx, ty]) => tx === x && ty === by)) {
        tiles.push([x, by])
      }
    }
  }

  return tiles
}

// ─── BFS connectivity ─────────────────────────────────────────────────────────

function buildAdjacency(corridors: Corridor[], roomCount: number): number[][] {
  const adj: number[][] = Array.from({ length: roomCount }, () => [])
  for (const c of corridors) {
    adj[c.fromRoom]?.push(c.toRoom)
    adj[c.toRoom]?.push(c.fromRoom)
  }
  return adj
}

function bfsReachable(start: number, adj: number[][]): Set<number> {
  const visited = new Set<number>([start])
  const queue = [start]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const neighbor of adj[cur] ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }
  return visited
}

// ─── Main generator ───────────────────────────────────────────────────────────

export interface GenerateMapParams {
  seed: string
  /** Number of rooms (should equal the rooms array length). */
  roomCount: number
  /** Direction of stairs between levels — used to place stair markers. */
  direction: string
  /** Is this the entry level (index 0)? */
  isEntry: boolean
  /** Is there a level above this one? */
  hasLevelAbove: boolean
  /** Is there a level below this one? */
  hasLevelBelow: boolean
  /**
   * Controls corridor length between rooms.
   * 1 = sprawling (8–14 tile gaps), 3 = normal (2–4), 5 = compact (1 tile).
   * Defaults to 3 if omitted.
   */
  density?: number
}

export function generateMap(params: GenerateMapParams): MapData {
  const rng = seedrandom(params.seed)
  const grid = new Grid(CANVAS, CANVAS)

  // Resolve gap range from density (clamp to 1–5, default 3).
  const densityKey = Math.min(5, Math.max(1, Math.round(params.density ?? 3))) as 1|2|3|4|5
  const [gapMin, gapMax] = GAP_BY_DENSITY[densityKey]!

  const placedRooms: MapRoom[] = []
  const corridors: Corridor[] = []

  // ── Place rooms ─────────────────────────────────────────────────────────────

  for (let i = 0; i < params.roomCount; i++) {
    const hint = sizeHint(i, params.roomCount)
    const w = randInt(rng, hint.minW, hint.maxW)
    const h = randInt(rng, hint.minH, hint.maxH)

    let placed = false

    if (i === 0) {
      // First room: roughly centered
      const x = Math.floor(CANVAS / 2 - w / 2)
      const y = Math.floor(CANVAS / 2 - h / 2)
      grid.fill(x, y, w, h, 1)
      placedRooms.push({ id: i, x, y, w, h })
      placed = true
    } else {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        // Pick a random already-placed room as the parent
        const parent = pick(rng, placedRooms)
        // Pick a direction: 0=right, 1=down, 2=left, 3=up
        const dir = randInt(rng, 0, 3)

        let x: number
        let y: number

        const gap = randInt(rng, gapMin, gapMax)

        switch (dir) {
          case 0: // right
            x = parent.x + parent.w + gap
            y = randInt(rng, parent.y - h + 1, parent.y + parent.h - 1)
            break
          case 1: // down
            x = randInt(rng, parent.x - w + 1, parent.x + parent.w - 1)
            y = parent.y + parent.h + gap
            break
          case 2: // left
            x = parent.x - w - gap
            y = randInt(rng, parent.y - h + 1, parent.y + parent.h - 1)
            break
          case 3: // up
            x = randInt(rng, parent.x - w + 1, parent.x + parent.w - 1)
            y = parent.y - h - gap
            break
          default:
            continue
        }

        // Need 1-tile padding around each room to prevent rooms from touching
        const padX = x - 1
        const padY = y - 1
        const padW = w + 2
        const padH = h + 2

        if (padX < 0 || padY < 0 || padX + padW > CANVAS || padY + padH > CANVAS) continue
        if (!grid.isFree(padX, padY, padW, padH)) continue

        grid.fill(x, y, w, h, 1)
        placedRooms.push({ id: i, x, y, w, h })

        // Add corridor from parent to this room
        const corridor = routeCorridor(parent, { id: i, x, y, w, h }, rng)
        corridors.push({ fromRoom: parent.id, toRoom: i, tiles: corridor })
        for (const [cx, cy] of corridor) {
          if (grid.get(cx, cy) === 0) grid.set(cx, cy, 2)
        }

        placed = true
        break
      }

      if (!placed) {
        // Fallback: place anywhere free
        let found = false
        for (let attempt = 0; attempt < MAX_ATTEMPTS * 2 && !found; attempt++) {
          const x = randInt(rng, 1, CANVAS - w - 2)
          const y = randInt(rng, 1, CANVAS - h - 2)
          if (!grid.isFree(x - 1, y - 1, w + 2, h + 2)) continue
          grid.fill(x, y, w, h, 1)
          placedRooms.push({ id: i, x, y, w, h })
          // Connect to nearest placed room
          let nearest = placedRooms[0]!
          let bestDist = Infinity
          for (const r of placedRooms) {
            if (r.id === i) continue
            const dist = Math.abs(r.x - x) + Math.abs(r.y - y)
            if (dist < bestDist) { bestDist = dist; nearest = r }
          }
          const corridor = routeCorridor(nearest, { id: i, x, y, w, h }, rng)
          corridors.push({ fromRoom: nearest.id, toRoom: i, tiles: corridor })
          for (const [cx, cy] of corridor) {
            if (grid.get(cx, cy) === 0) grid.set(cx, cy, 2)
          }
          found = true
        }
        // If we truly couldn't place, skip this room (rare edge case)
      }
    }
  }

  // ── BFS connectivity fix ─────────────────────────────────────────────────────

  const adj = buildAdjacency(corridors, placedRooms.length)
  const reachable = bfsReachable(0, adj)

  for (const room of placedRooms) {
    if (!reachable.has(room.id)) {
      // Find nearest reachable room and connect
      let nearest: MapRoom | null = null
      let bestDist = Infinity
      for (const r of placedRooms) {
        if (!reachable.has(r.id)) continue
        const dist = Math.abs(r.x - room.x) + Math.abs(r.y - room.y)
        if (dist < bestDist) { bestDist = dist; nearest = r }
      }
      if (nearest) {
        const corridor = routeCorridor(nearest, room, rng)
        corridors.push({ fromRoom: nearest.id, toRoom: room.id, tiles: corridor })
        for (const [cx, cy] of corridor) {
          if (grid.get(cx, cy) === 0) grid.set(cx, cy, 2)
        }
        reachable.add(room.id)
        adj[nearest.id]?.push(room.id)
        adj[room.id]?.push(nearest.id)
      }
    }
  }

  // ── Stair markers ────────────────────────────────────────────────────────────

  /**
   * Place a stair in a random quadrant of the room so it doesn't overlap the
   * room-number label that sits at the tile centre.
   */
  function stairTile(room: MapRoom): { x: number; y: number } {
    const cx = Math.floor(room.x + room.w / 2)
    const cy = Math.floor(room.y + room.h / 2)
    // Offset toward a randomly-chosen quadrant (at least 1 tile, at most w/3 or h/3)
    const qx  = rng() < 0.5 ? -1 : 1
    const qy  = rng() < 0.5 ? -1 : 1
    const offX = Math.max(1, Math.floor(room.w / 3))
    const offY = Math.max(1, Math.floor(room.h / 3))
    return { x: cx + qx * offX, y: cy + qy * offY }
  }

  const stairs: StairMarker[] = []

  if (params.hasLevelAbove) {
    const r = placedRooms[0]
    if (r) {
      const { x, y } = stairTile(r)
      stairs.push({ x, y, direction: 'up' })
    }
  }

  if (params.hasLevelBelow) {
    const r = placedRooms[placedRooms.length - 1]
    if (r) {
      const { x, y } = stairTile(r)
      stairs.push({ x, y, direction: 'down' })
    }
  }

  // ── Crop canvas to bounding box ──────────────────────────────────────────────

  if (placedRooms.length === 0) {
    return { width: 10, height: 10, rooms: [], corridors: [], stairs }
  }

  let minX = CANVAS, minY = CANVAS, maxX = 0, maxY = 0
  for (const r of placedRooms) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
  }
  for (const c of corridors) {
    for (const [cx, cy] of c.tiles) {
      minX = Math.min(minX, cx)
      minY = Math.min(minY, cy)
      maxX = Math.max(maxX, cx + 1)
      maxY = Math.max(maxY, cy + 1)
    }
  }

  // Add 2-tile margin
  const margin = 2
  minX = Math.max(0, minX - margin)
  minY = Math.max(0, minY - margin)

  // Offset all coords so (minX, minY) becomes (0, 0)
  const shiftedRooms: MapRoom[] = placedRooms.map((r) => ({
    ...r,
    x: r.x - minX,
    y: r.y - minY,
  }))

  const shiftedCorridors: Corridor[] = corridors.map((c) => ({
    ...c,
    tiles: c.tiles.map(([cx, cy]) => [cx - minX, cy - minY] as [number, number]),
  }))

  const shiftedStairs: StairMarker[] = stairs.map((s) => ({
    ...s,
    x: s.x - minX,
    y: s.y - minY,
  }))

  const width = maxX - minX + margin
  const height = maxY - minY + margin

  return {
    width,
    height,
    rooms: shiftedRooms,
    corridors: shiftedCorridors,
    stairs: shiftedStairs,
  }
}

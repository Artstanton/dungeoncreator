# Phase 5 — Map Generator

## What was built

### API — algorithmic map generation (`apps/api/src/lib/map.ts`)

A seeded, deterministic map layout engine written from scratch. Given a seed string and a room count it produces a `MapData` JSON object describing the tile-grid layout of one dungeon level.

Algorithm:

1. **Room placement** — Rooms are placed one at a time onto a 80×80 tile occupancy grid.
   - Room 0 (the entrance) is placed roughly centred on the canvas.
   - Each subsequent room picks a random already-placed room as a parent and a random cardinal direction, then walks outward until it finds space (including a 1-tile margin for corridors). After `MAX_ATTEMPTS` failures the room is placed anywhere free as a fallback.
   - Room sizes are seeded from the RNG with a size hint per role: entrances and final rooms are larger; regular rooms are mid-sized.

2. **Corridor routing** — Each new room is connected to its parent by an L-shaped orthogonal path (horizontal-first or vertical-first, chosen randomly). Corridor tiles are claimed in the occupancy grid so later rooms avoid them.

3. **BFS connectivity check** — After all rooms are placed, a BFS from room 0 identifies any disconnected rooms. Each is connected to its nearest reachable room with an additional corridor.

4. **Stair markers** — `up` and `down` stair icons are placed in room centres at the appropriate levels (entry floor, top floor, bottom floor, etc.) depending on dungeon direction.

5. **Canvas crop** — The layout is trimmed to the bounding box of all rooms and corridors plus a 2-tile margin.

The seed used per level is `{dungeonSeed}-level-{i}`, so each floor of a multi-floor dungeon is independently deterministic.

### Shared types (`packages/shared/src/index.ts`)

Added Zod schemas and TypeScript types:
- `MapRoom` — `{ id, x, y, w, h }` in tiles
- `Corridor` — `{ fromRoom, toRoom, tiles: [x,y][] }`
- `StairMarker` — `{ x, y, direction }`
- `MapData` — `{ width, height, rooms, corridors, stairs }`

`LevelDetail` schema now includes `mapData?: string` (raw JSON string from DB).

### API route update

`GET /api/dungeons/:id` now includes `mapData` on each level in the response. `generateDungeon()` accepts a `seed` param and passes per-level seeds to `generateMap()`.

### Web — SVG renderer (`apps/web/src/components/DungeonMap.tsx`)

Renders a `MapData` object as an SVG viewport at 22px/tile.

Visual spec (matching CONTEXT.md):
- **Rock background** — flat `#c8c8c8` fill behind everything
- **Corridor fills** — white `rect` per corridor tile (excluding room tiles)
- **Room fills** — white `rect` per room
- **Interior grid lines** — faint `#e8e8e8` 1px lines inside each room
- **Walls** — computed edge-by-edge: any tile edge shared with a non-occupied neighbour gets a black 3px wall stroke
- **Room numbers** — centred serif text, golden when selected
- **Hover** — transparent hit rect with `rgba` highlight on hover
- **Selection** — amber outline rect inside the room; room number turns golden
- **Stair glyphs** — arrow inside a circle, placed at stair marker tiles

### Web — Dungeon detail page (`apps/web/src/pages/DungeonDetailPage.tsx`)

Replaces the Phase 4 stub. Layout:
- **Header** — dungeon name, campaign badge, metadata chips (theme, CR, direction, floor count), back link
- **Level tabs** — one per floor, labelled with floor name and relative index (Entry, +1, -1, etc.). Hidden for single-floor dungeons.
- **Level view** — split pane: SVG map on the left (dark-background scrollable area), room detail panel on the right.
- **Room detail panel** — appears on room click, shows description, encounters, treasure, secrets, hook. Falls back to a clickable room index list when nothing is selected.

### Routing

`App.tsx` updated to render `DungeonDetailPage` at `/dungeons/:id` (replacing the Phase 4 stub).

## Decisions

- **No procedural-generation library** — the placement algorithm is hand-rolled with `seedrandom`. This keeps the dependency count low and the behaviour transparent.
- **Wall rendering via edge detection** — rather than drawing room/corridor outlines directly, walls are computed tile-by-tile. This naturally handles T-junctions, doorways, and any topology without special-casing.
- **mapData as a raw JSON string in the DB** — Prisma's SQLite layer stores it as TEXT. The web app parses and validates it with Zod's `mapDataSchema` at render time; invalid/old placeholder data falls back gracefully.
- **22px tiles** — large enough to read room numbers clearly at 1:1; the map area is a scrollable overflow container so very large maps aren't clipped.

## Known limitations / TODOs

- Rooms are always rectangular. Irregular (L-shaped) rooms are noted in CONTEXT.md as a future enhancement.
- Corridor tiles are 1 tile wide in the occupancy grid but rendered as 1 tile (not 2 as the spec mentions as an option). Two-tile corridors can be added later by expanding the path.
- Wall hatching and rubble textures are deferred to Phase 7 "pretty mode".
- The dungeon list / library view (Phase 6) has not been started yet.

## How to run

```bash
# From the repo root (Git Bash)
cd "E:\dev\Dungeon Creator"
pnpm install          # picks up seedrandom + @types/seedrandom
pnpm dev              # starts API on :4000 and Vite on :5173
```

Generate a dungeon via the form at `http://localhost:5173/dungeons/new`. After generation completes you'll be redirected to the detail page at `/dungeons/:id` where the SVG map renders immediately.

**Note:** dungeons generated before Phase 5 have `mapData` set to a placeholder `{ placeholder: true, … }` object that fails the `mapDataSchema` parse. The detail page renders "Map data unavailable." for those. Re-generate to get a real map.

# Dungeon Creator — Project Context

**Read this first.** Single source of truth for anyone (or any new Claude session) picking up work on this project. Supersedes any earlier conversation.

---

## What this is

A local-only web app that procedurally generates dungeons for tabletop RPGs (D&D-style). The user (Zego / Artstanton) runs it on their own machine. Each dungeon is produced by combining:

- User-seeded parameters from a form (treasures, encounters, CR range, floor count, room counts, names).
- **AI-generated narrative content** for each room (via Grok / xAI).
- **Algorithmic map generation** for each level (not AI — deterministic, seeded).

Generated dungeons are saved to a local SQLite database and organized into user-defined **campaigns**.

## Scope

**Local-only.** No deploy target for now. The whole thing runs on the user's laptop via `pnpm dev`. If deploy becomes relevant later, we'll add a Dockerfile; for now, don't assume a cloud host.

**No authentication.** No users, no passwords, no sessions, no cookies, no CSRF. One person uses this app on their own machine.

**Campaigns instead of users.** Dungeons are grouped into user-defined campaigns (free-text name). A `campaign` table exists with an FK from `dungeon`. The dungeon-creation form has a campaign picker that accepts either an existing campaign or a new name (creating the campaign row on the fly). The library view filters by campaign.

---

## Stack (locked)

| Layer              | Choice                                       | Why                                                                 |
|--------------------|----------------------------------------------|----------------------------------------------------------------------|
| Frontend           | React 18 + Vite 5 + TypeScript               | Biggest ecosystem, fast dev server                                   |
| Backend            | Fastify 4 + TypeScript (Node 20+)            | Boring-modern, built-in schema validation, shares TS with frontend   |
| Database           | SQLite via Prisma                            | Single-file, zero config, strongly relational data                   |
| AI provider        | Grok (xAI), OpenAI-compatible API            | User's choice; use `openai` npm SDK pointed at `https://api.x.ai/v1` |
| Map rendering      | SVG                                          | Clickable rooms, CSS styling, accessibility                          |
| Monorepo           | pnpm workspaces                              | Cleanest workspace ergonomics                                        |
| Seeded RNG         | `seedrandom`                                 | Deterministic maps; no `Math.random()` in the generator              |

### Conventions

- **Shared package imports `.ts` directly** — no build step for `@dungeon/shared`. Works because `moduleResolution: Bundler` + Vite + tsx all handle TypeScript natively.
- **`.env` at the repo root**. The API resolves it relative to its own source file via `dotenv.config()`.
- **Vite dev proxy** forwards `/api/*` → `http://127.0.0.1:4000` so the browser sees same-origin.
- **Strict TypeScript** with `noUncheckedIndexedAccess` and `noImplicitOverride` on.
- **No ESLint/Prettier yet** — coming in Phase 7 (Polish).

---

## Build order (current)

The user reviews each phase before the next one starts.

1. ~~Scaffolding~~ ✅ (see `docs/phases/01-scaffolding.md`)
2. ~~Data model + persistence~~ ✅ (see `docs/phases/02-data-model.md`)
3. ~~Dungeon generation form UI~~ ✅ (see `docs/phases/03-form-ui.md`)
4. ~~Room Generator~~ ✅ (see `docs/phases/04-room-generator.md`)
5. ~~Map Generator~~ ✅ (see `docs/phases/05-map-generator.md`)
6. **Library view** ← next — list, detail, update, delete; grouping/filter by campaign
7. Polish — loading states, empty states, error messages, accessibility, responsive layout, ESLint/Prettier

### Phase deliverables

Every phase ends with:

- Working code
- A brief written summary in `docs/phases/NN-name.md` — what was built, decisions made, TODOs
- Instructions to run it locally (if anything changed)
- Wait for user review before moving to the next phase

---

## Data model (as built — Phases 2–5)

```
campaign
  id          string  (cuid)
  name        string  unique
  createdAt   datetime
  updatedAt   datetime

dungeon
  id                 string  (cuid)
  name               string
  campaignId         string?  FK → campaign
  theme              string?
  crMin              int
  crMax              int
  seed               string   -- drives deterministic map layout
  direction          string   -- 'up' | 'down' | 'both'
  specificTreasures  string   -- JSON: string[]
  specificEncounters string   -- JSON: string[]
  notes              string?
  createdAt          datetime
  updatedAt          datetime

level
  id        string  (cuid)
  dungeonId string  FK → dungeon (cascade delete)
  index     int     -- 0 = entry, positive = up, negative = down
  name      string  -- AI-generated (e.g. "The Ossuary")
  roomCount int     -- actual count Grok returned for this level
  mapData   string  -- JSON: MapData (see shared MapData type)
  createdAt datetime
  updatedAt datetime

room
  id            string  (cuid)
  levelId       string  FK → level (cascade delete)
  index         int
  name          string
  description   string
  encounters    string  -- JSON: string[]
  treasure      string  -- JSON: string[]
  secrets       string?
  hooks         string?
  rawAiResponse string? -- verbatim Grok response, stored for replay/debug
  createdAt     datetime
  updatedAt     datetime
```

---

## "Random" semantics

The form has a Random toggle per field. **Random means the AI decides** — not the algorithmic layout code.

- **Narrative/content params** (CR range, encounters, treasure, theme, floor count, rooms per floor): if Random, Grok picks values in a single call before room generation starts. Resolved values are saved to the dungeon record so regen is reproducible.
- **Geometric layout** (exact room sizes, positions, corridor routing): always algorithmic, driven by the stored `seed`.

The `randomize` flags object is included in POST `/api/dungeons`. The generation layer reads it and calls Grok for any flagged fields before generating rooms.

If the user provides a theme but randomizes other fields, the theme is passed as a hint (`Theme hint: ...`) in the random-resolution call so Grok can pick appropriate CR, floor count, etc. for that theme.

Room count per floor is a **range** (`roomsMin` / `roomsMax`). Grok picks a count within that range for each floor based on the level's narrative character.

End-to-end flow:

```
form submit → POST /api/dungeons
  → create dungeon record in SQLite
  → resolve Random fields via Grok (one call if any randomize flags set)
  → update dungeon record with resolved values
  → for each floor:
      → call Grok: "generate N–M rooms for this level"
      → parse + validate response (retry up to 3× with backoff)
      → call generateMap(seed, roomCount, ...) → MapData
      → save level + rooms in one DB transaction
      → pass level summary to next floor for narrative coherence
  → re-fetch dungeon with resolved values
  → return dungeon + generationErrors[]
  → web app navigates to /dungeons/:id
```

---

## Map visual spec (as implemented)

Classic black-wall-on-white-room top-down dungeon maps (TSR/Dennis Laffey style).

- **Grid resolution:** 5 feet per tile. 1 tile = 22px in the SVG viewport.
- **Rooms:** rectangular, white fill, faint `#e4e4e4` grid lines inside at 0.8px.
- **Walls:** solid black, 3px stroke on all exterior tile edges (computed edge-by-edge so T-junctions and doorways are handled automatically).
- **Corridors:** 1-tile-wide white path between rooms, walls on exterior edges.
- **Doors:** one door per contiguous corridor-room wall segment (BFS-grouped so a hallway running alongside a room wall gets one door, not many). Door is a dark slab punched through the wall at the midpoint of the group.
- **Exterior rock:** flat `#c8c8c8` fill.
- **Room numbers:** black serif text, centred, clickable.
- **Stairs:** step-line rectangle symbol with UP/DN label and directional arrow.
- **Interactive:** hover highlight, click → room detail panel, selected room gets amber outline.

## Map generation algorithm (as built in Phase 5)

`apps/api/src/lib/map.ts` — seeded with `seedrandom`, fully deterministic.

1. Place rooms on an 80×80 tile occupancy grid. Room 0 centred; each subsequent room picks a random placed room as parent, picks a cardinal direction, walks outward until clear (1-tile padding). Falls back to anywhere-free after `MAX_ATTEMPTS`.
2. Room sizes have hints by role: entrance/final rooms larger, regular rooms mid-sized.
3. Connect each new room to its parent with an L-shaped orthogonal corridor (random horizontal-first or vertical-first). Corridor tiles claimed in the occupancy grid.
4. BFS from room 0: any disconnected rooms get a corridor to the nearest reachable room.
5. Place stair markers (UP/DN) in room centres based on level position and dungeon direction.
6. Crop canvas to bounding box + 2-tile margin; shift all coords to origin.
7. Serialize to `MapData` JSON; stored in `level.mapData`.

Per-level seed: `{dungeonSeed}-level-{i}`.

---

## External services + secrets

- **Grok API key** in `.env` as `GROK_API_KEY`. Use `openai` SDK with `baseURL: https://api.x.ai/v1`. Model name in `GROK_MODEL` (currently `grok-4-1-fast-reasoning`).
- No other external services.

AI cost controls (implemented in Phase 4):

- Max tokens per call: 200 (random field resolution), 2000 (room generation).
- Raw Grok response stored on every room (`room.rawAiResponse`) for replay/debug without re-paying.
- Sliding-window rate limiter: 5 generation requests per 60 seconds.
- Retry with exponential backoff (1 s → 2 s → 4 s, 3 attempts). Skips retry on 401/403.
- Partial-save: if a floor fails after all retries, completed floors are saved and errors are returned in `generationErrors[]`.

---

## API routes (as built)

```
GET  /api/ping
GET  /api/campaigns
POST /api/campaigns

GET  /api/dungeons
GET  /api/dungeons/:id      -- includes levels[].rooms[] and levels[].mapData
POST /api/dungeons          -- creates + generates dungeon

PATCH /api/rooms/:id        -- partial update of room content fields
```

---

## Repo layout (as of Phase 5)

```
E:\dev\Dungeon Creator\
├── .github/workflows/ci.yml
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── seed.ts
│   │   │   └── migrations/
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── grok.ts       lazy OpenAI client (getGrok / getModel)
│   │       │   ├── generate.ts   room generation orchestrator
│   │       │   ├── map.ts        algorithmic map generator
│   │       │   └── prisma.ts     singleton Prisma client
│   │       ├── routes/
│   │       │   ├── campaigns.ts
│   │       │   └── dungeons.ts   includes PATCH /api/rooms/:id
│   │       └── index.ts
│   └── web/
│       └── src/
│           ├── api/
│           │   └── client.ts
│           ├── components/
│           │   └── DungeonMap.tsx   SVG map renderer
│           ├── pages/
│           │   ├── CreateDungeonPage.tsx
│           │   └── DungeonDetailPage.tsx
│           ├── App.tsx
│           ├── main.tsx
│           └── index.css
├── packages/
│   └── shared/
│       └── src/index.ts   Zod schemas for all models + API I/O
├── docs/
│   ├── CONTEXT.md
│   └── phases/
│       ├── 01-scaffolding.md
│       ├── 02-data-model.md
│       ├── 03-form-ui.md
│       ├── 04-room-generator.md
│       └── 05-map-generator.md
├── data/
│   └── dev.db             SQLite database (gitignored)
├── .env                   gitignored — copy from .env.example
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

GitHub: https://github.com/Artstanton/dungeoncreator

---

## How to resume

1. `cd /e/dev/Dungeon\ Creator` (Git Bash) — or `cd "E:\dev\Dungeon Creator"` (PowerShell).
2. Read phase docs `01` through `05` to get up to speed.
3. Run `pnpm install && pnpm dev`. Confirm the API terminal logs `[grok] model=grok-4-1-fast-reasoning  key=xai-...` with a non-empty key prefix.
4. Phases 1–5 are complete and working. Next is **Phase 6 — Library view**.

---

## Known gotchas

**Lazy Grok client** — `apps/api/src/lib/grok.ts` exports `getGrok()` and `getModel()` functions, not module-level constants. This is intentional: ES module static imports are hoisted and run before `dotenv.config()` fires in `index.ts`. Creating the `OpenAI` client at module load time means `GROK_API_KEY` is undefined → 401 on every request. Do not revert to a module-level singleton.

**Prisma Studio on Windows/Git Bash** — fails with `EPERM: scandir 'Application Data'` (a junction point issue). Run from PowerShell instead, or just use `curl` to inspect data.

**Grok reasoning models return null for optional fields** — `grok-4-1-fast-reasoning` returns `null` instead of omitting optional JSON fields. All Zod schemas for AI responses use `.nullish()` / `.nullable()` with transforms to handle this gracefully.

**ECONNREFUSED on startup** — normal race condition. Vite starts and hits `/api/campaigns` before the Fastify server is ready. It logs a proxy error and retries; everything is fine once the API is up.

**Dungeons generated before Phase 5** have `mapData` set to a placeholder object that fails `mapDataSchema` validation. The detail page shows "Map data unavailable" for those — regenerate to get a real map.

**`seedrandom` requires `pnpm install`** — added in Phase 5. Must run `pnpm install` before `pnpm dev` after pulling this or any commit that adds a new dependency.

---

## Working style notes

- User prefers bash commands (has Git Bash on Windows).
- User does their own `git push` and `pnpm install` (Linux sandbox can't operate on the Windows mount reliably for filesystem-heavy ops).
- User's TTRPG domain knowledge is strong — trust them on CR, encounter balance, map aesthetics.
- User values boring, well-supported tech over cutting-edge. When in doubt, pick the safer option.
- Don't over-format chat responses. Prose > bullet soup.

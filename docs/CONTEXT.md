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

**No authentication.** No users, no passwords, no sessions, no cookies, no CSRF. One person uses this app on their own machine. This deletes what was originally Phase 2 ("Auth system") from the build order.

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
| Seeded RNG         | `seedrandom` or similar                      | Deterministic maps; no `Math.random()` in the generator              |

### Conventions

- **Shared package imports `.ts` directly** — no build step for `@dungeon/shared`. Works because `moduleResolution: Bundler` + Vite + tsx all handle TypeScript natively.
- **`.env` at the repo root**. The API resolves it relative to its own source file.
- **Vite dev proxy** forwards `/api/*` → `http://127.0.0.1:4000` so the browser sees same-origin.
- **Strict TypeScript** with `noUncheckedIndexedAccess` and `noImplicitOverride` on.
- **No ESLint/Prettier yet** — coming in Phase 7 (Polish).

---

## Build order (current)

The user reviews each phase before the next one starts.

1. ~~Scaffolding~~ ✅ (see `docs/phases/01-scaffolding.md`)
2. **Data model + persistence** — Prisma schema (`campaign`, `dungeon`, `level`, `room`), first migration, seed script
3. Dungeon generation form UI — all parameters, Random toggles, validation, submit handler (stub the generator)
4. Room Generator — Grok integration, prompt engineering, structured JSON, retry/partial-save
5. **Map Generator** ← the fun part — algorithmic layout, seeded RNG, SVG rendering
6. Library view — list, detail, update, delete; grouping/filter by campaign
7. Polish — loading states, empty states, error messages, accessibility, responsive layout, ESLint/Prettier

### Phase deliverables

Every phase ends with:

- Working code
- A brief written summary in `docs/phases/NN-name.md` — what was built, decisions made, TODOs
- Instructions to run it locally (if anything changed)
- Wait for user review before moving to the next phase

---

## Data model (target for Phase 2)

```
campaign
  id          string  (cuid)
  name        string  unique
  createdAt   datetime
  updatedAt   datetime

dungeon
  id             string  (cuid)
  name           string
  campaignId     string  FK → campaign  (nullable)
  theme          string?            -- overall aesthetic/mood passed to AI
  crMin          int                -- challenge rating range
  crMax          int
  seed           string             -- for deterministic map regen
  direction      enum('up','down','both')  -- floor stacking
  specificTreasures  json           -- array of strings (must-include)
  specificEncounters json           -- array of strings (must-include)
  notes          string?
  createdAt      datetime
  updatedAt      datetime

level
  id           string  (cuid)
  dungeonId    string  FK → dungeon
  index        int     -- 0 = first floor, +1 = up, -1 = down
  name         string
  roomCount    int
  mapData      json    -- tile-based or node-based layout, regenerable from seed
  createdAt    datetime
  updatedAt    datetime

room
  id           string  (cuid)
  levelId      string  FK → level
  index        int     -- position in generation order
  name         string
  description  string
  encounters   json
  treasure     json
  secrets      string?
  hooks        string?
  rawAiResponse string?  -- stored for debug/replay without re-paying
  createdAt    datetime
  updatedAt    datetime
```

Adjust as needed during Phase 2 — this is a sketch, not a spec.

---

## "Random" semantics

The form has a Random toggle per field. **Random means the AI decides** — not the algorithmic layout code.

Split:

- **Narrative/content params** (CR range, encounters, treasure, names, themes, room-count-per-level): if Random, Grok picks values before anything else. These values are saved to the dungeon record so regen is reproducible.
- **Geometric layout** (exact room sizes, positions, corridor routing): always algorithmic, driven by the stored `seed`. Layout-by-LLM produces overlapping / disconnected rooms — not worth fighting.

End-to-end flow:

```
form submit
  → fill any Random slots via Grok (one call)
  → generate rooms via Grok (ideally one call per level for coherence)
  → generate map algorithmically from room list + seed
  → save everything to SQLite
  → redirect to dungeon detail view
```

---

## Map visual spec

Reference images (in `Source Material/`, gitignored) are classic black-wall-on-white-room top-down dungeon maps — similar to Dennis Laffey 2015 or the numbered TSR-module style.

Concrete rendering spec for Phase 5:

- **Grid resolution:** 5 feet per tile. 1 tile ≈ 20–24px in the SVG viewport.
- **Rooms:** rectangular (irregular/L-shaped later if time). White fill (`#ffffff`). Visible faint gray grid lines inside (`#e8e8e8` at 1px).
- **Walls:** solid black, stroke 3–4px. Every room and corridor has walls on all outer edges.
- **Corridors:** 1 or 2 tiles wide (5' or 10'), drawn as a white path between rooms with **parallel black wall-lines on both long sides**. Orthogonal turns and T-junctions only. No diagonal corridors.
- **Exterior (unexcavated rock):** flat light gray fill (`#c8c8c8`). No hatching in v1 — that's a Phase 7 "pretty mode" if we get there.
- **Room numbers:** black text, centered, clickable → opens room detail.
- **Interactive:** hovering a room highlights it; clicking opens the generated content; selected room gets a subtle outline.

**Not in v1:** wall hatching, rubble texture, water features, stairs illustrated between levels (use a simple stair icon in the tile), doors-as-distinct-graphics (a gap in the wall is fine).

## Map generation algorithm (Phase 5 notes)

Starting approach — iterate if it produces ugly maps:

1. Place rooms one at a time on a grid. First room centered; subsequent rooms placed adjacent to an existing room with a gap for a corridor. Collision-check against the occupancy grid.
2. Room sizes pulled from the seeded RNG with hints from room type (e.g., "throne room" → larger, centrally placed; "secret vault" → small, placed last and connected via a longer corridor).
3. Connect each new room to the nearest existing room with an orthogonal corridor (L-shape routing). Corridors claim tiles on the occupancy grid too.
4. Post-process: ensure connectivity (BFS from room 0; if any room is unreachable, add a corridor).
5. Serialize to JSON: `{ width, height, rooms: [{id, x, y, w, h, label}], corridors: [{tiles: [[x,y],...]}], stairs: [...] }`. Store in `level.mapData`. Deterministic from seed.

Libraries to consider: `seedrandom`, or use [`@napi-rs/crc32`] for seed hashing. Keep it boring — no procedural-generation mega-library.

---

## External services + secrets

- **Grok API key** in `.env` as `GROK_API_KEY`. Use `openai` SDK with `baseURL: https://api.x.ai/v1`. Model name in `GROK_MODEL` so it can be swapped without code change.
- No other external services.

AI cost controls (Phase 4 requirements):

- Cap tokens per generation.
- Store raw LLM response alongside parsed JSON (`room.rawAiResponse`) so we can replay/debug without re-paying.
- Rate-limit the generation endpoint (even locally — runaway loops happen).
- Handle API failures: retry with exponential backoff, partial-save completed rooms, surface a user-facing error with a "regenerate failed rooms" action.

---

## Repo layout (current)

```
E:\dev\Dungeon Creator\
├── .github/workflows/ci.yml     typecheck + build on push/PR
├── apps/
│   ├── api/                     Fastify + TS. Currently: GET /api/ping
│   └── web/                     React + Vite + TS. Currently: pings /api/ping
├── packages/
│   └── shared/                  Zod schemas + TS types (currently just pingResponse)
├── docs/
│   ├── CONTEXT.md               this file
│   └── phases/
│       └── 01-scaffolding.md    Phase 1 summary
├── .env.example
├── .gitignore                   includes Source Material/, _tmp_*
├── README.md
├── package.json                 root workspace
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

GitHub: https://github.com/Artstanton/dungeoncreator

---

## How to resume

1. `cd /e/dev/Dungeon\ Creator` (Git Bash) — or `cd "E:\dev\Dungeon Creator"` (PowerShell).
2. Read `docs/phases/01-scaffolding.md` for what's already built.
3. Confirm `pnpm dev` shows the green "API connected" card at http://localhost:5173. If not, that's Phase 1 debugging, not new work.
4. Start Phase 2 (Data model + persistence): install Prisma, write the schema from the sketch above, generate the client, create the first migration, write a tiny seed script. Then add a couple of API routes that read/write through Prisma and confirm the shared Zod schemas still work end-to-end.
5. Write `docs/phases/02-data-model.md` when done. Wait for user review.

## Working style notes

- User prefers bash commands (has Git Bash on Windows).
- User does their own `git push` and `pnpm install` (Linux sandbox can't operate on the Windows mount reliably for filesystem-heavy ops).
- User's TTRPG domain knowledge is strong — trust them on CR, encounter balance, map aesthetics.
- User values boring, well-supported tech over cutting-edge. When in doubt, pick the safer option.
- Don't over-format chat responses. Prose > bullet soup.

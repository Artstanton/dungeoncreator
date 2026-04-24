# Phase 4 — Room Generator (Grok Integration)

## What was built

- **`apps/api/src/lib/grok.ts`** — OpenAI-compatible client pointed at `https://api.x.ai/v1`. Reads `GROK_API_KEY`, `GROK_BASE_URL`, and `GROK_MODEL` from the repo-root `.env`.
- **`apps/api/src/lib/generate.ts`** — All generation logic:
  - `checkRateLimit()` — sliding-window rate limiter (5 requests / 60 s). Prevents runaway loops.
  - `withRetry()` — exponential backoff (1 s → 2 s → 4 s, 3 attempts). Skips retry on 401/403.
  - `extractJson()` — strips markdown code fences Grok sometimes wraps around JSON.
  - `resolveRandomFields()` — one Grok call to fill in any fields the user toggled Random (theme, CR range, floor count, rooms per floor). Falls back to provided defaults on parse failure.
  - `generateLevel()` — one Grok call per floor with a detailed prompt. Returns `levelName`, `rooms[]`, and `rawResponse` (stored verbatim on each room for debug/replay).
  - `generateDungeon()` — orchestrates everything: resolve → update dungeon record → generate floors sequentially (each floor's summary fed to the next as a coherence hint) → partial-save on per-floor errors.
- **`apps/api/src/routes/dungeons.ts`** — POST `/api/dungeons` now calls `generateDungeon` after creating the record, re-fetches the updated dungeon (resolved values), and returns `generationErrors[]`. GET `/api/dungeons/:id` now includes full rooms nested under each level.
- **`packages/shared/src/index.ts`** — Added `roomSchema`, `levelDetailSchema`, `dungeonDetailSchema` updated to include rooms, `createDungeonResponse` (dungeon + `generationErrors`).
- **`apps/web/src/api/client.ts`** — `createDungeon()` return type updated to `CreateDungeonResponse`.
- **`apps/web/src/pages/CreateDungeonPage.tsx`** — Submit button shows "Generating dungeon… (this may take a minute)". Partial generation errors are shown in the form with a 4-second countdown before navigating.

## Decisions made

- **One Grok call per level** — better narrative coherence than one-room-at-a-time. Each subsequent floor gets a summary of the previous floor's rooms as a context hint.
- **`rawAiResponse` on every room** — the same level JSON is stored on each room in that level. Storage is cheap (local SQLite). This lets you replay or debug a specific room's generation without touching Grok.
- **Partial save** — if floor 2 of 3 fails, floors 0 and 1 are already saved. The dungeon record is always created. `generationErrors` in the response tells the client what went wrong per floor. "Regenerate failed floors" is a Phase 7 TODO.
- **Rate limit at 5/minute** — local single-user app, but runaway loops happen. Simple sliding-window in memory is enough.
- **`response_format: { type: 'json_object' }`** — forces structured JSON output. Still need `extractJson()` as a safety net because Grok occasionally wraps even json_object responses in code fences.
- **Re-fetch after generation** — `resolveRandomFields` writes resolved CR/theme back to the dungeon via `prisma.dungeon.update`. The POST handler re-fetches with `findUniqueOrThrow` to return the actual persisted values rather than the stale in-memory object.
- **Grok model from env** — `GROK_MODEL` in `.env`. Swapping models requires no code change.

## How to run

```bash
# Make sure GROK_API_KEY is set in .env
pnpm install   # picks up the new openai package
pnpm dev
```

Fill out the form at http://localhost:5173, hit "Create dungeon". The request stays open while Grok generates — expect 15–60 seconds depending on floor count and model latency.

Inspect the result:

```bash
# Get the dungeon with all levels and rooms
curl http://localhost:4000/api/dungeons/<id>
```

Or open Prisma Studio to browse room content:

```bash
pnpm --filter @dungeon/api run db:studio
```

## TODOs / notes for later phases

- Phase 5 (Map Generator): `level.mapData` is still `{ placeholder: true }`. Phase 5 replaces it with real algorithmic layout JSON derived from the room list and the dungeon seed.
- Phase 6 (Library view): `GET /api/dungeons/:id` now returns full rooms, so the detail page has everything it needs.
- Phase 7 (Polish): "Regenerate failed floors" action — a POST `/api/dungeons/:id/levels/regenerate` endpoint that re-runs generation for any level with status `error`.
- The `randomize.specificEncounters` and `randomize.specificTreasures` flags are handled implicitly: when true, the form sends `[]`, and the Grok prompt says "choose appropriate encounters/treasure" instead of "must include X". No special API logic needed.

# Phase 3 — Dungeon Generation Form UI

## What was built

- **React Router** (`react-router-dom@6`) added to the web app. Routes:
  - `/` → redirects to `/dungeons/new`
  - `/dungeons/new` → the creation form
  - `/dungeons/:id` → stub page (replaced in Phase 6)
- **`apps/web/src/api/client.ts`** — thin fetch wrapper (`getCampaigns`, `createDungeon`). Parses Fastify error bodies and surfaces clean messages.
- **`apps/web/src/pages/CreateDungeonPage.tsx`** — full creation form with all parameters and Random toggles.
- **Form fields:**
  - Dungeon name (required)
  - Campaign (text + datalist autocomplete from existing campaigns; auto-creates if new name)
  - Theme / mood (textarea)
  - Challenge Rating min/max (paired number inputs)
  - Floor direction (select: up / down / both)
  - Number of floors (number input)
  - Rooms per floor (number input)
  - Specific encounters (tag input: Enter or Add button)
  - Specific treasures (tag input)
  - DM notes (textarea)
  - Seed (collapsed under "Advanced options")
- **Random toggles** on: theme, CR range, floor count, rooms per floor, encounters, treasures. When toggled on, the field is disabled and the `randomize` flags object in the POST body tells Phase 4 what to ask Grok.
- **Validation:** client-side via shared Zod schema + manual cross-field check (crMin ≤ crMax). Server-side errors surface below the submit button.
- **Submit flow:** POST `/api/dungeons` → on success, navigate to `/dungeons/:id` (the stub page for now).
- **`packages/shared/src/index.ts`** extended with `floorCount`, `roomsPerFloor`, and `randomizeFlagsSchema` / `RandomizeFlags`.
- **`apps/api/src/routes/dungeons.ts`** updated to destructure and ignore `floorCount`, `roomsPerFloor`, and `randomize` until Phase 4.
- **`apps/web/src/index.css`** — form styles added: random-row layout, random toggle button (amber when active), CR range pair, tag chips, field errors, advanced details block, dark mode.

## Decisions made

- **`randomize` flags in the POST body** — when a field is toggled Random, the field's value is omitted (Zod defaults apply) and `randomize.field: true` is sent. Phase 4 reads these flags to know what to ask Grok before saving. The dungeon record always stores the AI-resolved concrete values — never a "random" placeholder.
- **Campaign as a plain text input with datalist** — simplest UX for a single-user app. The API's `upsert` handles the "existing vs new" distinction transparently.
- **No external component library** — tag input, random toggle, and CR pair are all plain HTML + CSS. Keeps the bundle small and avoids fighting a component library's styling.
- **React Router added now** — small cost, prevents a retrofit in Phase 6 when the library/detail view arrives.
- **Stub detail page** — `/dungeons/:id` shows a placeholder until Phase 6. After form submit, the user is routed there with the new dungeon's id in the URL.

## How to run

```bash
# Install react-router-dom (new dependency)
pnpm install

# Start dev servers as usual
pnpm dev
```

Open http://localhost:5173 — it redirects to `/dungeons/new`. Fill in the form and submit. The dungeon record is created in SQLite (no rooms yet — that's Phase 4).

Verify a submission created the record:

```bash
curl http://localhost:4000/api/dungeons
```

## TODOs / notes for later phases

- Phase 4 (Room Generator) will read `randomize` flags to call Grok for AI-decided fields before saving.
- `floorCount` and `roomsPerFloor` are accepted by the API but not yet used to create `Level` records — Phase 4 does that.
- The `/dungeons/:id` detail page is a stub — Phase 6 replaces it with the real library/detail view.
- Form currently has no loading skeleton for the campaign datalist; if the API is slow, the suggestions just appear late. Fine for local use.

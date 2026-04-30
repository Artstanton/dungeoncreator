# Phase 6 — Data Management / Library View

## What was built

### Library page (`/dungeons`)
- Lists all dungeons in a responsive card grid.
- Each card shows: dungeon name (link to detail), campaign badge, CR range, floor count, travel direction, and creation date.
- Campaign filter tabs at the top let you narrow by campaign. Counts are shown per tab. An "Uncampaigned" tab appears automatically when any dungeons have no campaign assigned.
- Delete button on each card triggers a browser `confirm()` dialog, then calls `DELETE /api/dungeons/:id` and removes the card immediately from the UI without a full reload.
- Empty state: first-time CTA to create a dungeon; filtered-empty state when a campaign has no results.

### API: DELETE /api/dungeons/:id
- Returns 204 No Content.
- Prisma cascades the delete to all `Level` and `Room` records (already set up via `onDelete: Cascade` in the schema).

### Navbar
- New `Navbar` component appears on the Library and Create pages.
- Brand link "Dungeon Creator" → `/dungeons`. "Library" link highlights when active. "+ New Dungeon" CTA button.
- Dark parchment colour scheme (`#2a1f0e` background) to match the overall aesthetic.

### Routing
- Default redirect now goes to `/dungeons` (library) instead of `/dungeons/new`.
- Detail page "← New dungeon" link changed to "← Library" → `/dungeons`.
- Create page h1 changed from "Dungeon Creator" to "New Dungeon" (app name is in the navbar).

### Shared types
- `DungeonListItem` schema and type added to `@dungeon/shared`. The existing `GET /api/dungeons` response was updated to include `density` to match.

## Decisions

- Client-side campaign filtering — no server query param needed since all dungeons load at once on a local app. Keeps the API simple.
- `confirm()` for delete — no modal component needed for a single-user local tool. Fast and zero dependencies.
- Navbar on Library + Create pages only. The Detail page has its own full-bleed layout with level tabs; adding a navbar there would break the `calc(100vh - ...)` height math.
- Card grid uses `auto-fill minmax(260px, 1fr)` so it reflows naturally without a media query.

## How to run

No new migrations or dependencies. Just `pnpm dev` from the repo root.

## Next

**Phase 7 — Polish**: loading states, empty states, error messages, accessibility, responsive layout, ESLint/Prettier.

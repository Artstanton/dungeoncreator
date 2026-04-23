# Dungeon Creator

Procedural dungeon generator for tabletop RPGs. Combines user-seeded parameters, AI-generated narrative content (via xAI / Grok), and algorithmic map generation.

## Stack

- **Frontend:** React + Vite + TypeScript
- **Backend:** Fastify + TypeScript (Node 20+)
- **Database:** SQLite (via Prisma, added in Phase 3)
- **AI:** Grok (xAI), OpenAI-compatible API
- **Map rendering:** SVG
- **Monorepo:** pnpm workspaces

## Project layout

```
apps/
  api/        Fastify server (REST API, AI calls, map generation)
  web/        React single-page app
packages/
  shared/     Shared Zod schemas + TypeScript types
```

## Prerequisites

- Node.js 20 or newer
- pnpm 9 or newer (`corepack enable` then `corepack prepare pnpm@latest --activate` works, or `npm i -g pnpm`)

## Setup

```bash
# 1. Install dependencies for all workspaces
pnpm install

# 2. Copy the env template and fill in values (at minimum GROK_API_KEY when you get there)
cp .env.example .env   # macOS/Linux
# On Windows PowerShell:
# Copy-Item .env.example .env

# 3. Start both apps in dev mode (API on :4000, web on :5173)
pnpm dev
```

Then open http://localhost:5173. The web app calls `/api/ping` through Vite's dev proxy to confirm the API is reachable.

## Scripts

Run from the repo root:

- `pnpm dev` — start all apps in parallel with hot reload
- `pnpm typecheck` — TypeScript checking across all workspaces
- `pnpm build` — production build (Phase 1: web only; API build added later)

## Build phases

Local-only, single-user. No auth. Dungeons are grouped into user-defined campaigns.

Each phase must be functional and user-reviewed before moving on.

1. **Scaffolding** ✅ — repo layout, package manifests, env config, CI
2. Data model — Prisma schema (`campaign`, `dungeon`, `level`, `room`), migrations, seed
3. Dungeon generation form UI — all parameters, Random toggles, validation
4. Room Generator — Grok AI integration, prompt engineering, structured JSON
5. Map Generator — algorithmic layout, seeded RNG, SVG rendering
6. Library view — list/detail/update/delete, filter by campaign
7. Polish — loading/empty/error states, accessibility, ESLint/Prettier

See [`docs/CONTEXT.md`](docs/CONTEXT.md) for the full project brief — read that first if you're picking this up in a new session.

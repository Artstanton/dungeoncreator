# Phase 1 — Project Scaffolding

## What was built

pnpm monorepo at `E:\dev\Dungeon Creator`:

- **`apps/web`** — React 18 + Vite 5 + TypeScript. Minimal `App` that calls `/api/ping` and shows whether the API is reachable.
- **`apps/api`** — Fastify 4 + TypeScript, single endpoint `GET /api/ping`. Loads `.env` from the repo root, CORS locked to localhost, `@fastify/sensible` for common error helpers.
- **`packages/shared`** — Zod schemas + TS types consumed by both apps. Currently just `pingResponse`; real schemas land in Phase 3.
- **Root configs** — `pnpm-workspace.yaml`, shared `tsconfig.base.json`, `.gitignore`, `.env.example`, `README.md`.
- **CI** — `.github/workflows/ci.yml` runs `pnpm install --frozen-lockfile && pnpm typecheck && pnpm build` on push-to-main and PRs.

## Decisions made

- **pnpm workspace**, not npm/yarn. Best workspace ergonomics, honored in CI.
- **Shared package imports `.ts` directly** — no build step for `@dungeon/shared`. Vite and tsx handle TypeScript natively; `moduleResolution: Bundler` makes it typecheck cleanly. Simpler than a build pipeline.
- **Vite dev proxy** forwards `/api/*` → `http://127.0.0.1:4000` so the browser treats everything as same-origin. Cookies Just Work in Phase 2; no CORS preflight dance.
- **`.env` at the repo root**. The API explicitly resolves the path relative to its own source file, so it works whether you run from the root or from `apps/api`.
- **Strict TS** including `noUncheckedIndexedAccess` and `noImplicitOverride` — these catch real bugs cheaply. Easy to soften later if noisy.
- **No ESLint/Prettier yet** — deferring to Phase 8 to keep Phase 1 small.

## TODOs / notes

- No lockfile committed yet. First local `pnpm install` will create `pnpm-lock.yaml` — commit it.
- Phase 2 will need `@fastify/cookie`, `@fastify/session` (or a minimal custom cookie session), and `argon2`.
- `pnpm build` currently builds web only. API build script is wired but unused; we'll exercise it when we add a production server config.
- The `Source Material/` folder (user-provided map references) is in the working tree but outside the code — not committed unless you want it. Consider adding `Source Material/` to `.gitignore` or moving it into `docs/references/`.

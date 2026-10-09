@AGENTS.md

# F1 Paddock Pass

Pick a Formula 1 Grand Prix, a grandstand and your seats, and nobody else can take the same ones. A portfolio project: every decision here has to be explainable in an interview.

Full scope, design and the reasoning behind each decision live in Linear (project "D · Proyecto insignia", in Spanish):

- **SPEC — F1 Paddock Pass**: problem, success criteria, scope and non-goals, architecture, data model, error handling, testing, risks.
- **Tech Assessment — F1 Paddock Pass**: stack and environments, the implementation plan per milestone, technical decisions, how each piece was tested.

The Obsidian note `Work Files/05 Practice/Projects/f1-paddock-pass.md` is only an index with the current status.

## How we work

Andrés creates the files and runs the commands. Claude explains, writes inside existing files, and reviews.

- **No git.** Don't run any git command, not even read-only ones. Andrés does all of it. If you need to know what changed, ask, or read the files.
- **No package scripts or installs.** Don't run `pnpm` (`dev`, `build`, `test`, `lint`, `typecheck`, `db:*`, `install`, `add`…) or `npx`. Say which command to run and why; Andrés runs it and pastes the output.
- **Andrés creates the files; Claude can write inside them.** Never create a new file or folder. When something new is needed, say which file to create and where, wait until he has created it, then write or edit its content. Editing existing files is fine.
- **Explain the why.** He has to defend every line in an interview: the trade-off, and the alternative that was discarded. Prefer the simple version he can explain over the clever one.
- **The scope is frozen.** If something isn't in the four features below, suggest it for the README's "what I'd do with more time" instead of building it.

## Scope (frozen 2026-10-06)

Entities: `user` · `grand_prix` · `section` (grandstand) · `seat` · `ticket`.

1. **Calendar**: Grand Prix list from the Jolpica-F1 API (cached), and each GP's sections with price and availability.
2. **Seat selection**: hold up to 4 seats for 10 minutes, then confirm (simulated checkout).
3. **Auth + profile**: favorite team from the API, which tints the UI with its color.
4. **My tickets**: list and cancel; cancelled seats become free again.

Out of scope: real payments, real circuit maps, admin panel (sections come from a seed), QR/email tickets, waitlist, dynamic pricing, live timing.

## Stack

| | |
|---|---|
| Framework | Next.js 16.4 (App Router, `src/`), React 19.3, TypeScript 5.9 |
| React Compiler | On (`reactCompiler: true`): no manual `useMemo`/`useCallback` unless measured |
| Caching | **Cache Components on** (`cacheComponents: true`): everything is dynamic by default; cache explicitly with `"use cache"` + `cacheLife` |
| Database | Neon Postgres 18 (`paddock_pass`, AWS us-east-1), a single branch: `production` |
| ORM | Drizzle 0.45 + drizzle-kit; driver `@neondatabase/serverless` **`Pool`** (WebSocket) |
| Tests | Vitest; DB tests run the real migrations on PGlite (in-memory Postgres) |
| Planned | Better Auth (PD-26), Zod 4 validation, Tailwind 4 + shadcn/ui, Playwright, GitHub Actions, Vercel |

Check `node_modules/next/dist/docs/` before writing Next.js code: Next 16 and Cache Components change APIs you may remember differently.

## Database rules

- **Env vars (Neon's names):** `DATABASE_URL` is the direct connection, used by drizzle-kit; `DATABASE_URL_POOLED` goes through the pooler, used by the app (`src/db/index.ts`). There is **one branch, `production`**, used both locally and on Vercel, so local changes hit the data the deployed app shows: be careful with deletes and test data. Automated tests never touch it (they use PGlite).
- **Why the `Pool` driver:** holding seats needs an interactive transaction, and `neon-http` doesn't support them.
- **Migrations:** change `src/db/schema.ts` → `pnpm db:generate` → review the SQL in `drizzle/` → `pnpm db:migrate`. Never edit a migration that was already applied; write a new one.
- **The concurrent case lives in the database:** `ticket_one_active_per_seat_uq` is a partial unique index on `ticket(seat_id) WHERE status IN ('held','confirmed')`. A second hold on the same seat fails with `23505` → respond `409 seat taken`. No `SELECT … FOR UPDATE` needed.
- **Holding seats is one transaction:** first mark expired holds on those seats as `expired`, then insert one `held` ticket per seat with the same `hold_group` and `expires_at = now() + 10 min`.
- **Money is integer cents.** A ticket copies the section's price when created.

## Data rules

- Grand Prix data comes from Jolpica-F1 (`https://api.jolpi.ca/ergast/f1/<season>.json`, `/<season>/constructors.json`). Public and keyless but rate-limited: always cache it. Team colors aren't in the API; they live in our own `constructorId → color` map.
- Seat availability changes every second: never cache it. Render it dynamically inside `<Suspense>`.
- Validate every server action input with Zod on the server, not only on the client.

## Conventions

- Code, comments, UI text and commit messages in English.
- Comments explain *why*, not *what*.
- Server Components by default; `"use client"` only where there's interaction (the seat grid, the countdown).

## Commands (Andrés runs them)

```bash
pnpm dev            # local server
pnpm build          # production build
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
pnpm test           # Vitest
pnpm db:generate    # schema.ts → new SQL migration in drizzle/
pnpm db:migrate     # apply migrations (uses DATABASE_URL, the direct connection)
pnpm db:studio      # Drizzle Studio
```

# Terrace Grow — Slice 1 (Blueberry Vertical Slice)

Architecture v1.4 (frozen). Only entities actually used by Slice 1.

## Structure

- `server/` — NestJS + Prisma backend
  - `src/engines/recommend-engine/` — pure functions: sunlight, variety ranking, pollination, container, water risk
  - `src/engines/soil-engine/` — pure functions: soil mix solver with H1-H7 constraints + L0-L3 fallback ladder
  - `src/agri-data.service.ts` — single governed data-access layer (all agricultural facts)
  - `src/governance.service.ts` — review-status gate (approved, or dev+draft fixtures)
  - `prisma/seed.ts` — DEV_FIXTURE seed (reviewStatus=draft, NOT approved content)
  - `prisma/migrations/` — versioned database migrations (verified via `migrate deploy`)
  - `scripts/test-db.js` — isolated test database (create / migrate / seed / drop)
  - `test/` — unit, integration (vitest) and E2E (supertest) suites
- `h5/` — Vite + Vue 3 + Vant mobile frontend

## Quick Start

```bash
# 1. Install dependencies (uses lockfile for reproducible builds)
npm run setup

# 2. Copy env and start database
cd server
cp .env.example .env
cd ..
npm run db:up

# 3. Run migrations & seed
npm run db:migrate     # prisma migrate deploy (versioned migrations)
npm run db:seed        # DEV_FIXTURE seed

# 4. Start development (tsc watch + server + h5)
npm run dev
```

> `db:push` is kept only for fast schema iteration during development. The
> canonical, verifiable path is `db:migrate` (migrations applied on a clean DB).

## Testing

```bash
# All tests against the isolated test database (terrace_grow_test):
#   reset test DB -> migrate deploy -> seed -> unit + integration + e2e
npm run test:all

# Individually:
npm run test:unit        # vitest src/ — engine pure functions (no DB)
npm run test:integration # vitest test/ — API + governance gate (test DB)
npm run test:e2e         # supertest full chain (test DB, requires server build)
```

Tests never touch the development database. `test:all` resets
`terrace_grow_test` (drop → create → `prisma migrate deploy` → seed) first, so
runs are repeatable and clean-room verifiable.

## Governance

All agricultural data tables carry governance fields:
- `source` — manual | ai_generated | expert
- `reviewStatus` — draft | ai_generated | cross_reviewed | approved
- `confidence` — 1-5

DEV_FIXTURE seed data is `reviewStatus='draft'` — NOT approved agricultural content. It exists ONLY for program verification.

**Draft data gate**: `ALLOW_DRAFT_FIXTURES=true` AND `APP_ENV=development` must both be set to allow draft data into engines. In production, only `reviewStatus='approved'` rows (and their approved nested relations: traits, attributes, environment requirements, crop rules, container requirements, substitutions) are served.

## License

Internal project — not open source.

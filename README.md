# Terrace Grow — Slice 1 (Blueberry Vertical Slice)

Architecture v1.4 (frozen). Only entities actually used by Slice 1.

## Structure

- `server/` — NestJS + Prisma backend
  - `src/engines/recommend-engine/` — pure functions: sunlight, variety ranking, pollination, container, water risk
  - `src/engines/soil-engine/` — pure functions: soil mix solver with H1-H7 constraints + L1-L4 fallback ladder
  - `prisma/seed.ts` — DEV_FIXTURE seed (reviewStatus=draft, NOT approved content)
  - `prisma/migrations/` — versioned database migrations
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
npm run db:push
npm run db:seed

# 4. Start development (tsc watch + server + h5)
npm run dev
```

## Testing

```bash
# Unit tests (22 examples)
npm run test

# API integration tests (11 assertions, requires database)
cd server
npm run build
ALLOW_DRAFT_FIXTURES=true node test/integration-e2e.js
```

## Governance

All agricultural data tables carry governance fields:
- `source` — manual | ai_generated | expert
- `reviewStatus` — draft | ai_generated | cross_reviewed | approved
- `confidence` — 1-5

DEV_FIXTURE seed data is `reviewStatus='draft'` — NOT approved agricultural content. It exists ONLY for program verification.

**Draft data gate**: `ALLOW_DRAFT_FIXTURES=true` AND `APP_ENV=development` must both be set to allow draft data into engines.

## License

Internal project — not open source.

# Terrace Grow — Slice 1 (Blueberry Vertical Slice)

Architecture v1.4 (frozen). Only entities actually used by Slice 1.

## Structure

- `server/` — NestJS + Prisma backend
  - `src/engines/recommend-engine/` — pure functions: sunlight, variety ranking, pollination, container, water risk
  - `src/engines/soil-engine/` — pure functions: soil mix solver with H1-H7 constraints + L1-L4 fallback ladder
  - `prisma/seed.ts` — DEV_FIXTURE seed (reviewStatus=draft, NOT approved content)
- `h5/` — Vite + Vue 3 + Vant mobile frontend

## Quick Start

```bash
# 1. Install dependencies
cd server && npm install
cd ../h5 && npm install

# 2. Copy env and start database
cd server
cp .env.example .env
docker-compose up -d

# 3. Run migrations & seed
npx prisma migrate dev
npx tsx prisma/seed.ts

# 4. Start backend
npm run start:dev

# 5. Start frontend (another terminal)
cd ../h5
npm run dev
```

## Governance

All agricultural data tables carry governance fields:
- `source` — manual | ai_generated | expert
- `reviewStatus` — draft | ai_generated | cross_reviewed | approved
- `confidence` — 1-5

DEV_FIXTURE seed data is `reviewStatus='draft'` — NOT approved agricultural content. It exists ONLY for program verification.

## Testing

```bash
cd server
npx vitest run
```

## License

Internal project — not open source.

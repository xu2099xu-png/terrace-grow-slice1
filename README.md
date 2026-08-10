# Terrace Grow

Terrace Grow is a Vue 3 H5 application backed by a NestJS/Prisma modular
monolith. Slices 1-3 cover governed crop recommendations, seasonal planning,
materials, soil calculations, and planting lifecycle tracking. Slice 4 adds the
configuration, validation, security, health, container, migration, and CI
foundation required for repeatable production deployment. Slice 5 introduces a
default-off grounded AI explanation sidepath that can explain already governed
application facts without changing recommendation, seasonal, or lifecycle
engine semantics.

The repository is deployable, but its agricultural content is not launch-ready.
The committed seed contains draft development fixtures only. Production never
serves those fixtures and reports content health as `not_ready` until a coherent
approved Crop + EnvironmentRequirement + SowingCalendar tuple exists.

## Repository

- `server/`: NestJS 11 API, Prisma, PostgreSQL, governed agricultural reads, and
  pure recommendation/soil/seasonal engines.
- `h5/`: Vue 3, Vite, Vant, and the existing hash-router mobile experience.
- `server/prisma/migrations/`: the only production schema deployment path.
- `docker-compose.production.yml`: PostgreSQL 16, internal API, and public H5
  ingress.
- `.github/workflows/ci.yml`: isolated database, tests, builds, migration upgrade,
  image builds, and production smoke.

## Development

Prerequisites are Node.js 22, npm, and Docker with Compose.

```bash
npm run setup
cp server/.env.example server/.env
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

`db:migrate` uses committed Prisma migrations. `db:push` remains available only
for local schema iteration and is never part of production startup.

Draft fixtures are visible only when both `APP_ENV=development` and
`ALLOW_DRAFT_FIXTURES=true`. Test mode uses its own explicit fixture contract.
Production rejects draft enablement, mock providers, and `SEASON_DATE` before
the HTTP listener starts. AI explanations default to `off`; provider failures,
daily provider caps, and disabled AI return rules-sourced responses without
inventing agricultural facts.

## Configuration

All server environment variables are parsed by the centralized runtime config:

| Variable | Required/default | Purpose |
| --- | --- | --- |
| `APP_ENV` | `development` | `development`, `test`, or `production` |
| `DATABASE_URL` | required | PostgreSQL connection URL |
| `PORT` | `3000` | API listen port |
| `JWT_SECRET` | local default | Production requires an explicit non-example value of 32+ characters |
| `JWT_EXPIRES_IN` | `365d` | Positive duration with `ms/s/m/h/d/w/y` unit |
| `CORS_ORIGINS` | local H5 origin | Comma-separated exact origins; required in production |
| `ALLOW_DRAFT_FIXTURES` | `false` | Development-only draft fixture gate |
| `LOCATION_RESOLVER` | `http` | `http` or non-production `mock` |
| `WEATHER_PROVIDER` | `http` | `http` or non-production `mock` |
| `LOCATION_API_KEY` | empty | AMap location adapter key |
| `QWEATHER_API_HOST` | empty | Dedicated QWeather API host |
| `QWEATHER_KEY` | empty | QWeather API key |
| `WEATHER_PROVIDER_TIMEOUT_MS` | `3500` | Provider timeout, 1-30000 ms |
| `RATE_LIMIT_GLOBAL_LIMIT` | `300` | Process-local global request limit |
| `RATE_LIMIT_TTL_MS` | `60000` | Limiter window, 1000-3600000 ms |
| `SEASON_DATE` | empty | Development/test-only deterministic date override |
| `AI_PROVIDER` | `off` | `off`, non-production `mock`, or `openai_compatible` |
| `AI_PROVIDER_BASE_URL` | empty | OpenAI-compatible base URL; production requires HTTPS when provider is enabled |
| `AI_PROVIDER_API_KEY` | empty | Bearer token for the OpenAI-compatible provider |
| `AI_PROVIDER_MODEL` | empty | Provider model name for `/chat/completions` |
| `AI_PROVIDER_TIMEOUT_MS` | `5000` | Provider timeout, 100-30000 ms |
| `AI_PROMPT_VERSION` | `slice5-v1` | Cache and prompt contract version |
| `AI_EXPLANATION_CACHE_TTL_SECONDS` | `86400` | Validated-answer cache TTL, 60-2592000 seconds |
| `AI_DAILY_PROVIDER_CALL_CAP` | `20` | Per-user Asia/Shanghai daily provider-call cap |
| `AI_ENDPOINT_LIMIT` | `20` | Per-user AI endpoint fixed-window limit |
| `AI_ENDPOINT_TTL_MS` | `60000` | AI endpoint limiter window, 1000-3600000 ms |

Provider values may be absent in production; the adapters degrade to unavailable
facts rather than inventing agricultural facts. Never commit a real `.env` or
provider credential.

## Grounded AI Explanations

`POST /api/ai/ask` is authenticated and accepts only typed agricultural
contexts:

- `perennial_plan`: `question`, `crop_id`, optional
  `selected_container_type_id`, optional `selected_variety_id`
- `seasonal_item`: `question`, `city_code`, `crop_id`
- `planting_now`: `question`, `planting_id`

The public response shape is fixed:

```json
{
  "status": "answered",
  "answer": "plain text",
  "source": "ai",
  "cache_hit": false,
  "citations": [{ "fact_id": "crop.name", "label": "作物", "value": "蓝莓", "unit": null }],
  "warnings": []
}
```

`status` is one of `answered`, `disabled`, `provider_unavailable`, or
`insufficient_data`. `source` is only `ai` or `rules`; provider success and cache
hits are both `answered` with `source=ai`, and `cache_hit` distinguishes them.
With `AI_PROVIDER=off`, the service does not serve cached AI responses and uses
rules output after context resolution. Production with no approved agricultural
context returns `insufficient_data` with an empty answer and no citations.

The OpenAI-compatible adapter posts to
`AI_PROVIDER_BASE_URL/chat/completions` with Bearer auth, configured model,
temperature `0`, `stream=false`, and JSON-object response format. CI and smoke
tests do not depend on a real provider; they use contract fixtures or
`AI_PROVIDER=off`.

## Verification

Tests recreate an isolated `terrace_grow_test` database, deploy all migrations,
seed draft fixtures, and never target the development database.

```bash
npm run test:all
npm run test:slice5-gate
npm run test:migration-upgrade
npm run build
npm run test:production-smoke
```

`test:migration-upgrade` verifies a fresh database to current, the frozen Slice
2 database to current, and the Slice 4 candidate database from git SHA
`853852d1d1c118f2f6765b280c4f0ef3d3299a29` to current without losing
representative user, identity, terrace, planting, planting event, or material
inventory data. Each path includes a second `migrate deploy` idempotency check.
The production smoke creates a unique Compose project and volume, runs with
`APP_ENV=production` and `AI_PROVIDER=off`, verifies draft content remains
closed, verifies the AI sidepath returns `insufficient_data` without approved
context, then removes all smoke resources.

The latest clean-room run passed 50 server unit tests (33 frozen engine tests
plus 17 configuration tests), 108 integration/gate tests, the API full-chain
script, 2 H5 component tests, and 4 Playwright paths. Detailed AC mapping is in
`Slice4-Delivery-Report.md`; counts are evidence, not replacements for the
frozen AC-to-test assertions.

## Production Compose

Set deployment-specific values in the shell or an external secret mechanism:

```bash
export POSTGRES_USER=terrace
export POSTGRES_PASSWORD='<database-password>'
export POSTGRES_DB=terrace_grow
export DATABASE_URL='postgresql://terrace:<database-password>@postgres:5432/terrace_grow?schema=public'
export JWT_SECRET='<at-least-32-random-characters>'
export CORS_ORIGINS='https://grow.example.com'
export H5_PORT=8080

docker compose -f docker-compose.production.yml config
docker compose -f docker-compose.production.yml up -d --build
```

Only H5 is published to the host. Nginx serves the SPA and proxies `/api` to the
internal API. PostgreSQL and the API remain on the Compose network. The API
container runs as a non-root user and executes the lockfile-pinned local
`prisma migrate deploy` before starting; migration failure prevents startup.
Production startup never pushes schema or seeds fixtures.

## Health

- `GET /api/health/live`: `200 {"status":"live"}` without a database query.
- `GET /api/health/ready`: `200 {"status":"ready"}` after a minimal application
  schema query; otherwise `503`.
- `GET /api/health/content`:
  - development: `200 {"status":"development_fixtures"}`
  - test: `200 {"status":"test_fixtures"}`
  - production with coherent approved content: `200 {"status":"ready"}`
  - production without it: `503 {"status":"not_ready"}`

Infrastructure readiness is intentionally separate from agricultural-content
readiness. A deployment can be healthy for migration and operations while still
being correctly closed to end users because approved content is absent.

## License

Internal project; not open source.

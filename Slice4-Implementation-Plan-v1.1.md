# Slice 4 Implementation Plan v1.1 - Production Foundation

> Status: FROZEN - implementation authorized after conditional-review closure.
> Baseline commit: `394ea65782f00a1589429dd0adadfc107657f86d`

## 1. Architecture Decision

Slice 4 hardens the existing modular monolith. It does not introduce a new
service, queue, cache, or cloud dependency.

Runtime topology remains:

```text
Browser -> H5 static server/reverse proxy -> NestJS API -> PostgreSQL
                                      |-> AMap/QWeather (optional adapters)
```

Configuration, transport validation, health, and deployment are infrastructure
concerns. Agricultural decisions remain in the existing governed data layer and
pure engines.

## 2. Planned Dependencies

Use maintained framework-standard packages rather than custom security parsers:

- `@nestjs/config` for centralized configuration lifecycle.
- `class-validator` and `class-transformer` for transport DTO validation.
- `@nestjs/throttler` for rate limiting.
- `helmet` for baseline HTTP response headers.

Exact versions will be compatible with NestJS 10 and committed through the
server lockfile. No frontend runtime dependency is planned.

## 3. Work Packages

### WP-1 Configuration foundation (AC-01, AC-02, AC-03)

Add `server/src/config/`:

- A typed environment parser with pure unit tests.
- A globally loaded Nest configuration module.
- Helpers for JWT options, CORS origins, port, proxy trust, and provider modes.

Register `JwtModule` once as a global module and remove repeated registration
from feature modules. Bootstrap consumes validated config for port, CORS,
Helmet, validation, and proxy trust.

Development defaults stay explicit and testable. Production has no secret or
origin fallback.

### WP-2 DTO and error boundary (AC-04, AC-05)

Add DTOs next to their owning modules:

- `auth/dto/anonymous-auth.dto.ts`
- `location/dto/resolve-location.dto.ts`
- `terraces/dto/upsert-terrace.dto.ts`
- `recommendations/dto/perennial-recommendation.dto.ts`
- `soil/dto/calculate-soil.dto.ts`
- `materials/dto/set-materials.dto.ts`
- `plantings/dto/create-planting.dto.ts`
- `plantings/dto/complete-action.dto.ts`
- Query DTOs for catalog/materials/seasons.

Create small reusable validators only where class-validator does not express a
domain rule, notably strict real calendar dates and unique bounded ID arrays.

Enable a global `ValidationPipe` with transformation, whitelist, and rejection
of non-whitelisted properties. Keep implicit conversion disabled and use
explicit transforms only where the frozen wire contract permits them. Add an
exception factory that emits the frozen `VALIDATION_ERROR` top-level shape and
stable `{ path, code, message }` entries without echoing submitted secret values.
Apply typed pipes/DTO validation to path parameters as well as body/query input.
Tests instantiate the app through the same bootstrap configuration helper so
production and test transport behavior cannot drift.

Replace controller-level `{ error: ... }` success bodies and raw `Error` throws
with Nest 4xx exceptions. Preserve existing 404 ownership behavior.

### WP-3 Authentication hardening (AC-02, AC-05)

- Make `AuthGuard` throw `UnauthorizedException` for missing credentials.
- Verify that the JWT subject maps to an active user.
- Make required and optional guards use the same `AuthService` verification.
- Validate anonymous device identifiers and handle unique-identity races by
  re-reading the winner rather than returning a database conflict.
- Keep the current anonymous identity product model unchanged.

No refresh-token or account migration system is added in this Slice.

### WP-4 Abuse protection (AC-06)

Register `ThrottlerModule` globally with conservative defaults. Add tighter
limits to anonymous auth and location resolution. Configure one trusted proxy
hop because production H5 is the only documented ingress. Configure Nginx to
replace inbound forwarding headers with its connection address, and make client
identity extraction explicit and testable.

Tests use isolated client addresses and an overridable short test window so they
remain fast and deterministic. They assert the final 429 `Retry-After` header,
separate buckets for two real clients through the production ingress, and one
stable bucket when a single client varies forged `X-Forwarded-For` values.

### WP-5 Health and content readiness (AC-07, AC-08)

Add a `HealthModule` with:

- Liveness controller with no dependencies.
- Database readiness check using Prisma and a minimal application-schema query.
- No direct interpretation of Prisma's internal migration table; successful
  entrypoint `prisma migrate deploy` remains the sole migration-state gate.
- Content readiness service using `GovernanceService`/`AgriDataService`, not raw
  draft-inclusive counts. It requires one coherent governed Crop +
  EnvironmentRequirement + SowingCalendar tuple from the production read path.
- Exact content response contracts for `development_fixtures`, `test_fixtures`,
  `ready`, and `not_ready`, including HTTP 503 for the latter. Slice 4 Gate tests
  exercise each APP_ENV branch independently.

Infrastructure readiness and content readiness remain separate. This lets an
empty deployment run for migration/operations while clearly preventing a false
product-launch signal.

### WP-6 Production images (AC-09, AC-10, AC-16)

Add:

- `server/Dockerfile` with dependency, build, and non-root runtime stages.
- `server/docker-entrypoint.sh` for `prisma migrate deploy` then API exec.
- `h5/Dockerfile` with Vite build and unprivileged Nginx runtime.
- `h5/nginx.conf` for static assets, SPA fallback, `/api` proxy, and health.
- Per-image `.dockerignore` adjustments if required.

Build stages use lockfiles. Runtime images receive configuration only through
environment variables. The server runtime stage includes a locally installed,
lockfile-pinned Prisma CLI; the entrypoint invokes that local binary and never
uses `npx` or downloads packages at startup. The H5 fallback preserves the hash
router without swallowing `/api` or missing static assets.

### WP-7 Production Compose and smoke test (AC-11, AC-13)

Add `docker-compose.production.yml` with PostgreSQL 16, server, and H5. Use
health-conditioned dependencies and no fixed container names.

Add `scripts/production-smoke.sh` which:

1. Creates an isolated Compose project and volume set.
2. Builds images.
3. Starts the topology with generated test-only runtime values.
4. Confirms liveness and infrastructure readiness.
5. Confirms production content is `not_ready` and product APIs expose no draft
   fixtures.
6. Verifies the server runs non-root.
7. Stops the isolated project and removes its test volume.

The script must set `APP_ENV=production`; "test-only" describes generated
credentials and isolated resources, not application mode. It must never target
the developer Compose project or development DB.

### WP-8 CI (AC-12, AC-14)

Add `.github/workflows/ci.yml` using Node 22 and PostgreSQL 16 through the
existing isolated test workflow. Install Playwright Chromium, run full tests and
builds, validate Compose, build both images, and then run the production smoke
against a unique isolated Compose project as a required eighth CI step.

Refactor test orchestration only if required for CI portability. Any refactor
must preserve the guarantee that tests cannot target the development database.

### WP-9 Documentation and baseline (AC-15, AC-16)

Rewrite the root README around the actual Slice 1-4 system. Update root package
description and add explicit scripts for configuration checks and production
smoke.

Document:

- Development environment.
- Test database isolation.
- Production environment contract.
- Health semantics.
- Draft versus approved content behavior.
- Container startup and migrations.

Do not touch the five untracked architecture documents.

## 4. Test Strategy

### Unit

- Environment parser: valid development/test/production matrices.
- Every production rejection condition.
- Calendar date and ID-array validators.
- CORS origin parsing.

### API integration

- Valid DTOs preserve current contracts.
- Invalid, unknown, oversized, out-of-range, and wrong-type input returns 400.
- Required auth returns 401 for every invalid token class.
- Optional auth remains anonymous on no token but rejects a supplied invalid
  token.
- Active-user status enforcement.
- Rate-limit isolation and 429 contract.
- Forwarded-header spoofing through the documented one-hop ingress.
- Health success/failure and production content-empty behavior.
- Content health exact status/body for development, test, production-ready, and
  production-not-ready branches.

### Regression

Run all current Slice 1-3 unit, integration, API E2E, H5, and Playwright tests.
Tests will use a shared app factory so global middleware is always present.

### Deployment

- `docker compose -f docker-compose.production.yml config`.
- Clean image builds.
- Clean PostgreSQL migration.
- Slice 2 frozen database to current migration with representative
  user/terrace/planting data preserved.
- Production topology smoke probes.
- Runtime UID assertions and image secret/artifact inspection.

## 5. Intended Implementation Order

1. Add Slice 4 test skeleton and configuration red tests.
2. Implement centralized configuration and shared app bootstrap.
3. Add DTOs and error-semantics tests, then update controllers.
4. Harden auth and add rate limiting.
5. Add health/content readiness.
6. Run full Slice 1-3 regression and fix contract-preserving failures.
7. Add production images, Compose, and smoke automation.
8. Add CI workflow.
9. Update README/package metadata.
10. Run clean-room test, migration, build, and container gates.
11. Produce Delivery Report for independent review.

## 6. Architecture Conflicts and Constraints

- No Prisma business schema change is currently expected.
- Slice 4 must not modify agricultural recommendation semantics,
  seasonal-engine eligibility/ranking/weather/sunlight rules, or agricultural
  governance semantics.
- If a failing regression identifies a defect in those frozen contracts, stop
  the affected work, record an architecture/baseline conflict, fix and
  independently freeze Slice 3 in a separate commit, then rebase/resume Slice 4.
- Content readiness must not create a second governance policy.
- Health checks must not query agricultural tables without the existing review
  filter.
- Rate limiting is process-local, which is sufficient for the current single
  API replica topology. Multi-replica shared limiting requires a later Redis or
  gateway decision.
- Production containerization does not constitute approval of fixture content.
- The existing anonymous device identity is retained; stronger account recovery
  and device transfer need a separate product Slice.

## 7. Expected Repository Changes

```text
.github/workflows/ci.yml
docker-compose.production.yml
README.md
package.json
scripts/production-smoke.sh
server/Dockerfile
server/docker-entrypoint.sh
server/.env.example
server/src/config/**
server/src/health/**
server/src/**/dto/**
server/src/main.ts
server/src/app.module.ts
server/src/auth/**
server/test/slice4-gate.spec.ts
h5/Dockerfile
h5/nginx.conf
```

Existing business engines, agricultural governance semantics, Prisma schema,
and Prisma migrations remain unchanged in Slice 4. A regression cannot be used
as a scope exception; follow the architecture-conflict procedure above.

## 8. Implementation Security Addendum

The production dependency audit on 2026-08-09 found advisories in the latest
NestJS 10 dependency tree, including high-severity transitive Express/Multer
findings. The implementation therefore uses the compatible NestJS 11.1.x,
Config 4.x, and JWT 11.x package set instead of the NestJS 10-compatible set
anticipated in section 2. This changes framework dependencies only; it does not
change the frozen HTTP or agricultural contracts. Compilation, all regression
gates, and production-container smoke remain mandatory evidence for the upgrade.

# Slice 4 Acceptance Criteria v1.1 - Production Foundation

> Status: FROZEN
> Baseline: `394ea65782f00a1589429dd0adadfc107657f86d`
> Product state at baseline: Slice 1 CLOSED / ACCEPTED, Slice 2 PASS / FROZEN,
> Slice 3 PASS / FROZEN.

Slice 4 implementation MUST NOT begin until this v1.1 document has passed
independent review and is explicitly frozen. The baseline above is the immutable
Slice 3 frozen code commit; later Delivery Report commits are evidence only.

## 1. Goal

Make the existing H5 + API application safe and repeatable to configure, build,
test, and deploy in a production-like environment.

This Slice does not claim that the product is ready to launch. In particular,
the repository contains no expert-approved agricultural content. Production
must continue to hide all draft fixtures and must expose that content is not
ready instead of silently serving test facts.

## 2. In Scope

- Centralized, fail-fast runtime configuration.
- Production-safe JWT and CORS behavior.
- DTO validation for all current HTTP inputs.
- Consistent authentication and client-error semantics.
- Abuse protection for public endpoints.
- Infrastructure and agricultural-content health endpoints.
- Reproducible production containers and Compose topology.
- CI that runs the same build and full test gate used locally.
- Current-state README and operational documentation.
- Regression protection for all Slice 1-3 behavior.

## 3. Explicitly Out of Scope

- Marking any DEV_FIXTURE row as `approved`.
- Creating or asserting new agricultural facts.
- A content-management or expert-review UI.
- New crops, varieties, lifecycle content, or sowing calendars.
- AI/DeepSeek, reminders, push notifications, mini-program, or ecommerce.
- Cloud-vendor infrastructure, domain names, TLS certificates, or paid keys.
- H5 visual redesign.
- Replacing anonymous identity with phone or WeChat authentication.

### Scope integrity rule

Slice 4 must not change agricultural recommendation semantics, seasonal-engine
eligibility/ranking/weather/sunlight rules, or agricultural-governance semantics.
If implementation exposes a defect in one of those frozen contracts, the
affected Slice 4 change stops. Record an architecture/baseline conflict, repair
and independently freeze Slice 3 in a separate commit, then rebase or resume
Slice 4. A production-boundary regression is not permission to absorb a Slice 3
business-contract change into Slice 4.

## 4. P0 Acceptance Criteria

### S4-AC-01 Centralized configuration and production fail-fast

There must be one configuration module responsible for reading and validating
runtime environment variables. Business modules must not each invent their own
JWT or server configuration.

At minimum, configuration validates:

- `APP_ENV` is one of `development`, `test`, or `production`.
- `DATABASE_URL` is present and is a PostgreSQL URL.
- `PORT` is an integer in the valid TCP port range.
- Production requires an explicit `JWT_SECRET` of at least 32 characters.
- Production rejects known example/default JWT secrets.
- Production requires a non-empty `CORS_ORIGINS` allowlist.
- Production rejects `ALLOW_DRAFT_FIXTURES=true`.
- Production rejects `SEASON_DATE` and mock location/weather providers.

Invalid production configuration must stop the process before the HTTP listener
starts. Error output may name the invalid variable but must not print secrets.

Development and tests may use documented local defaults.

### S4-AC-02 One JWT configuration

`AppModule`, `AuthModule`, and `SeasonsModule` must not register independent JWT
secrets. Required auth and optional auth must verify tokens using the same
configuration and expiry.

Automated tests must prove that:

- A token issued by anonymous auth works on required-auth endpoints.
- The same token works as optional auth on seasonal recommendations.
- A token signed with another secret is rejected.
- A malformed or expired token returns HTTP 401.

### S4-AC-03 Production CORS allowlist

- Development keeps a documented local-origin policy.
- Production only emits `Access-Control-Allow-Origin` for configured exact
  origins in `CORS_ORIGINS`.
- A disallowed origin receives no allow-origin header.
- Credentials are enabled only with the explicit allowlist, never with a
  reflected arbitrary origin.

Tests cover an allowed and a disallowed origin.

### S4-AC-04 Global request validation

Nest global validation must use transformation and a whitelist. Unknown input
properties are rejected, not silently persisted or forwarded.

Typed DTOs must cover all current input surfaces:

- `POST /api/auth/anonymous`
- `POST /api/location/resolve`
- `POST /api/terraces`
- `POST /api/recommendations/perennial`
- `POST /api/soil/calculate`
- `PUT /api/users/me/materials`
- `POST /api/plantings`
- `POST /api/plantings/:id/events`
- Current catalog, materials, seasons, and crop-detail query parameters.

Validation must include, where applicable:

- Required strings, bounded lengths, and allowed enum values.
- Latitude `[-90, 90]` and longitude `[-180, 180]`.
- Strict `YYYY-MM-DD` calendar dates.
- Bounded, unique string arrays.
- Required booleans without truthy/falsy coercion.

Invalid requests return HTTP 400 with a stable JSON error shape. Existing valid
Slice 1-3 requests must continue to work unchanged.

The validation error shape is frozen at the top level:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Invalid request",
  "errors": []
}
```

Each `errors` entry contains stable `path`, `code`, and `message` string fields;
it must not echo secret values. Path parameters, including planting/crop/resource
identifiers, must use typed validation or parsing appropriate to their identifier
format. `ValidationPipe` transformation must keep implicit conversion disabled;
in particular, string values such as `"false"`, `"0"`, and `"yes"` must never
become boolean `true` through truthy/falsy coercion.

### S4-AC-05 Correct HTTP authentication and error semantics

- Missing, malformed, invalid, or expired required-auth credentials return 401,
  not 403 and not an unhandled 500.
- A token whose user no longer has `status=active` returns 401.
- Missing required anonymous-auth input returns 400, not 500.
- Domain validation failures use 4xx exceptions; mutation endpoints must not
  return a 2xx response containing an `{ error: ... }` object.
- Ownership-protected resources continue to use the existing non-enumerating
  404 behavior.

Tests cover each error class without exposing stack traces or secrets.

### S4-AC-06 Public-endpoint rate limiting

Use a maintained Nest-compatible rate-limit library. At minimum, anonymous auth
and location resolution have explicit limits; a conservative global fallback
protects other endpoints.

Automated tests must prove:

- Requests below the limit succeed.
- Requests above the limit return 429 and a `Retry-After` header.
- One client's limit does not consume another client's allowance.
- A same-client request cannot manufacture independent buckets by changing
  `X-Forwarded-For` or other forwarding headers.
- Normal browser E2E paths do not hit the limit.

Proxy trust must be explicitly configured for the documented single reverse
proxy topology. The H5 reverse proxy must replace client-supplied forwarding
headers with the connection address used by the trusted one-hop policy. Tests
must verify both isolated real clients through the production ingress and the
forwarded-header spoofing case. The final HTTP 429 response must be explicitly
asserted to contain a valid `Retry-After` header; library defaults are not
accepted as evidence without the response assertion.

### S4-AC-07 Health and readiness contracts

Add public endpoints with no secret-bearing output:

- `GET /api/health/live`: process liveness, no database dependency, HTTP 200.
- `GET /api/health/ready`: database connectivity plus a minimal query against
  application-required schema, HTTP 200 when ready and 503 when unavailable.
- `GET /api/health/content`: governed agricultural-content readiness.

`health/content` has this exact machine contract:

```text
development:
200 { "status": "development_fixtures" }

test:
200 { "status": "test_fixtures" }

production with usable governed content:
200 { "status": "ready" }

production without usable governed content:
503 { "status": "not_ready" }
```

"Usable governed content" means that the existing production product-read path
can return at least one coherent tuple of an approved Crop, its approved
EnvironmentRequirement, and an approved SowingCalendar for that crop and climate
zone. A raw approved-row count or an isolated approved Crop is not sufficient.
The check must reuse `GovernanceService`/`AgriDataService` (or the exact same
governed query path), not duplicate governance with raw Prisma counts.

Production with `ALLOW_DRAFT_FIXTURES=true` is rejected before HTTP startup by
S4-AC-01, so it is not an HTTP runtime state. Separate service-level governance
tests must still prove that draft rows cannot satisfy the coherent-content query.

The Slice 4 Gate must assert all four content-health branches independently:
development fixtures, test fixtures, production ready, and production not-ready.

The server entrypoint's successful `prisma migrate deploy` is the deployment
migration gate. Readiness must not implement a second migration-state algorithm
by interpreting Prisma's internal `_prisma_migrations` table.

### S4-AC-08 Production governance remains closed by default

All existing production governance regression tests remain green. Add a single
production smoke test proving that, with the repository's current seed data:

- Public crop and seasonal APIs expose no draft agricultural facts.
- Protected recommendation/material/lifecycle reads expose no draft facts.
- `health/content` reports `not_ready`.

No migration or seed change may promote fixture review status.

### S4-AC-09 Server production image

Provide a reproducible multi-stage server image that:

- Installs from the committed lockfile.
- Generates Prisma Client and compiles TypeScript during build.
- Contains production dependencies and required Prisma migration assets.
- Contains a locally installed, lockfile-pinned Prisma CLI required by
  `prisma migrate deploy`; startup must not use `npx` package download or require
  network package installation.
- Runs as a non-root user.
- Starts with production configuration supplied at runtime, not baked secrets.
- Applies `prisma migrate deploy` before starting the API and fails if migration
  fails.
- Has a container health check using the readiness endpoint.

The image must not contain `.env`, test results, local `node_modules`, or draft
seed execution in its startup path.

### S4-AC-10 H5 production image and API proxy

Provide a reproducible multi-stage H5 image that:

- Builds the Vite application from its lockfile.
- Serves static assets as a non-root runtime user.
- Preserves the existing hash-router behavior. Application entry paths safely
  resolve to `index.html`, while `/api` and static asset paths are not swallowed
  by the SPA fallback.
- Proxies `/api` to the server service without exposing provider keys.
- Includes sensible static-asset caching while not long-caching `index.html`.
- Has a container health check.

### S4-AC-11 Production Compose contract

Add a production-oriented Compose file for PostgreSQL, API, and H5 which:

- Does not use fixed global `container_name` values.
- Uses service health checks and dependency health conditions.
- Persists PostgreSQL data in a named volume.
- Exposes only the H5 HTTP port by default; database and API remain internal.
- Receives secrets and deployment-specific values from environment variables.
- Does not seed DEV_FIXTURE data.
- Can be validated with `docker compose config` and started on a clean Docker
  state.

The existing developer Compose workflow must continue to work.

### S4-AC-12 Continuous integration gate

Add a GitHub Actions workflow using a pinned Node LTS major and PostgreSQL 16.
For every push/PR to `main`, CI must:

1. Install all three lockfile dependency sets with `npm ci`.
2. Install the pinned Chromium required by Playwright.
3. Recreate the isolated test database and deploy migrations.
4. Run `npm run test:all`.
5. Run the root production build.
6. Validate the production Compose configuration.
7. Build both production images without publishing them.
8. Run the production container smoke test against an isolated Compose project
   with the API explicitly configured as `APP_ENV=production`.

No test may connect to or mutate a development/production database.

### S4-AC-13 Clean migration and startup paths

Automated verification must cover:

- Fresh database: all historical migrations deploy successfully.
- Slice 2 frozen database to current: existing user/terrace/planting data
  remains and the Slice 3 migration deploys successfully.
- Re-running deployment migrations is idempotent.
- API startup fails cleanly when database configuration is invalid.
- Production startup never runs `prisma db push` or seed.

Schema changes are not expected for this Slice. Any discovered need for a
business-data schema change requires an explicit architecture-conflict note
before migration work begins.

### S4-AC-14 Slice 1-3 regression gate

The final `npm run test:all` must include and pass:

- The current baseline evidence of 33 engine unit tests and 88 integration/gate
  tests, or superseding equivalents.
- API full-chain tests.
- H5 component tests.
- Four Playwright golden paths.
- New Slice 4 configuration, validation, auth, health, and production-governance
  tests.

Tests may be reorganized, but no existing behavioral assertion may be silently
deleted or weakened. Test counts are delivery evidence, not a substitute for
contract coverage.

### S4-AC-15 Documentation and repository baseline

Update the root README and package metadata to describe the actual Slice 1-4
system rather than a Slice 1-only repository. Documentation must include:

- Current features and explicit non-production content status.
- Local development and isolated test workflows.
- All supported environment variables without real secret values.
- Production Compose startup and migration behavior.
- Health endpoint semantics.
- The latest actual test counts generated at delivery time.

The five currently untracked architecture documents must not be silently added,
deleted, or modified. Their repository disposition is a separate owner decision.

### S4-AC-16 Secret and artifact hygiene

The tracked repository and built images must contain no real `.env` files,
provider keys, JWT secrets, database passwords beyond documented local examples,
test reports, or local absolute paths.

Static checks cover tracked files and container build contexts. Logs and health
responses must never echo secret values.

## 5. Required Test Artifacts

- `server/test/slice4-gate.spec.ts` for configuration, validation, auth, health,
  CORS, and governance contracts.
- Focused unit tests for pure configuration/validation helpers.
- Container smoke script that builds and starts the production topology, probes
  health, verifies the empty approved-content state, and shuts down cleanly.
- Existing `npm run test:all` remains the canonical local gate.
- A separate script may run container smoke tests so local unit development does
  not rebuild images on every invocation; CI and final delivery must run it.

## 6. Delivery Evidence

The Slice 4 Delivery Report must map every AC to implementation, automated test,
and result. It must include:

- Final commit SHA.
- Exact build/test commands and exit codes.
- Fresh and upgrade migration results.
- Production configuration negative-test results.
- Production image user IDs and health-check results.
- `docker compose config` and clean-start results.
- Any `NOT AUTOMATED` item with an explicit waiver. P0 items may not be waived.
- An `AC -> implementation -> exact test name -> asserted behavior -> result`
  matrix. Aggregate test counts alone are not acceptance evidence.

## 7. Definition of Done

Slice 4 is accepted only when:

1. This document is frozen before production code changes begin.
2. S4-AC-01 through S4-AC-16 pass.
3. Slice 1-3 regression gates remain green.
4. Production still serves no draft agricultural facts.
5. Production deployment reports content `not_ready` until expert-approved data
   is supplied.
6. Independent review has no unresolved P0/P1 findings.

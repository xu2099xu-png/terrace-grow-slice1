# Slice 4 Delivery Report - Production Foundation

> Status: PASS / FROZEN
> Frozen AC: `Slice4-Acceptance-Criteria-v1.1.md`
> Slice 3 baseline: `394ea65782f00a1589429dd0adadfc107657f86d`
> Slice 4 frozen-design commit: `5b2df953f209dc620fc07336253d96b77bcb73c0`
> Unique code candidate: `853852d1d1c118f2f6765b280c4f0ef3d3299a29`
> Original Slice 4 code candidate: `7919bf867b1c33ca7dd089a7a211a7ed75416a39`

This report records implementation and execution evidence. Independent final
audit has declared Slice 4 PASS/FROZEN. This report/process HEAD does not
replace the frozen product-code candidate.

## 0. Final Independent Audit

Independent final audit result: **Slice 4 = PASS / FROZEN**.

- Blocking: 0.
- Frozen product-code candidate:
  `853852d1d1c118f2f6765b280c4f0ef3d3299a29`.
- Exact candidate hosted CI run `31292692456`: SUCCESS.
- Current PR process/report HEAD hosted CI run `31293133519`: SUCCESS.
- The Playwright closure fix only replaced fixed waits with `waitForURL`; it
  did not delete or weaken assertions.
- Commits after `853852d1d1c118f2f6765b280c4f0ef3d3299a29` are AGENTS/report
  documentation changes only and do not supersede the frozen product-code
  candidate.
- Slice 5 may begin from the frozen Slice 4 baseline.

## 1. Scope Integrity

- No change exists under `server/prisma/schema.prisma`, historical migrations,
  or `server/prisma/seed.ts` between the frozen Slice 3 baseline and candidate.
- No agricultural engine file changed.
- Existing governance semantics remain approved-only outside the explicit
  development draft-fixture gate. Slice 4 content health reuses that filter.
- The five owner-managed, untracked Chinese architecture documents remain
  untracked and were not modified or added.
- The QWeather change in this Slice is dependency injection plus correction of
  the previously noted coordinate-order comment; forecast parsing and frozen
  weather semantics are unchanged.

## 2. Delivered Architecture

- Central `RuntimeConfigModule` validates all supported environments and
  production fail-fast rules. No `process.env` read remains in `server/src`.
- One global JWT module issues and verifies required/optional auth tokens.
- Shared app bootstrap installs Helmet, exact CORS, one-hop production proxy
  trust, and the frozen global validation error contract.
- Typed DTOs cover every current body, query, and path-parameter surface.
- Global and endpoint rate limits use `@nestjs/throttler`; Nginx replaces
  client-supplied forwarding headers.
- Health separates process, database/application schema, and governed content.
- Production topology is H5/Nginx -> internal Nest API -> internal PostgreSQL.
  Both application images run non-root; only H5 binds a host port.
- The server entrypoint invokes its locally installed pinned Prisma CLI before
  API startup. It never downloads a package, pushes schema, or seeds fixtures.
- CI uses Node 22, PostgreSQL 16, three lockfiles, Chromium, full tests,
  Slice2-to-current migration, builds, Compose validation, images, and isolated
  production smoke.

## 3. Dependency Security Decision

The first production audit found advisories in the final NestJS 10 dependency
line. The candidate therefore moves the compatible framework set to NestJS
11.1.x, Config 4.x, and JWT 11.x. Vitest 4 and Happy DOM 20 remove dev-tool
advisories. This framework-only deviation is recorded in the frozen plan's
implementation addendum and passed the complete regression and container gates.

Final audit results:

```text
npm audit --omit=dev                  -> 0 vulnerabilities
npm --prefix server audit --omit=dev  -> 0 vulnerabilities
npm --prefix h5 audit --omit=dev      -> 0 vulnerabilities
npm --prefix server audit             -> 0 vulnerabilities
npm --prefix h5 audit                 -> 0 vulnerabilities
```

## 4. Automated Results

All commands below exited `0` against the candidate worktree:

| Command | Result |
| --- | --- |
| `npm run test:all` | 50 server unit, 108 integration/gate, API full-chain, 2 H5 component, 4 Playwright PASS |
| `npm run test:migration-upgrade` | Slice 2 frozen DB -> current PASS; user/terrace/planting preserved; 4 migrations; second deploy idempotent |
| `npm run build` | Nest TypeScript and H5 Vite production builds PASS |
| `npm run compose:production:config` | PASS; rendered Compose output 75 lines |
| `SMOKE_PROJECT_NAME=terrace_s4_candidate H5_PORT=35824 npm run test:production-smoke` | Final images built; production topology smoke PASS; isolated volume removed |
| `docker run ... rhysd/actionlint:1.7.7` | `.github/workflows/ci.yml` PASS |
| `git diff --check` | PASS |

Unit composition is 33 frozen engine tests plus 17 runtime-configuration tests.
Integration composition is Slice 3 Gate 43, plantings 11, Slice 4 Gate 20,
Slice 1 integration 16, governance 10, and Slice 2 Gate 8.

## 5. Container Evidence

The final smoke ran the API with `APP_ENV=production` and generated isolated
credentials/resources. It asserted:

- Live `200 {"status":"live"}`, ready `200 {"status":"ready"}`, and content
  `503 {"status":"not_ready"}` through H5 ingress.
- Seasonal/perennial catalog, materials, and lifecycle reads expose no draft
  fixture data; governed recommendation fails with 4xx when content is absent.
- Server UID `1000`; H5 UID `101`.
- Server image has no `.env`, `test`, or build-time `node_modules/.cache`.
- Server healthcheck targets `/api/health/ready`; H5 targets `/health`.
- A second local `prisma migrate deploy` reports no pending migrations.
- API and PostgreSQL have empty host `PortBindings`; H5 is the only ingress.
- Invalid database startup exits nonzero before API readiness.
- Twenty requests from client A succeed; the next returns 429 with positive
  `Retry-After` despite changing forged `X-Forwarded-For`; client B still gets
  201 from its independent bucket.

The smoke trap removed the isolated Compose project, containers, network, and
named volume after completion.

## 6. AC Traceability

| AC | Implementation | Exact automated evidence and asserted behavior | Result |
| --- | --- | --- | --- |
| S4-AC-01 | `runtime-config.ts`, `RuntimeConfigModule` | `accepts valid APP_ENV=%s`; `rejects invalid %s`; `production rejects %s`; `configuration errors name variables without echoing secret values`; smoke invalid-DB startup | PASS |
| S4-AC-02 | Global async `JwtModule`, `AuthService.verifyActive`, optional/required guards | `tokens are shared by required and optional auth...`; `required auth returns 401 for missing, malformed, wrong-secret, and expired tokens` | PASS |
| S4-AC-03 | Shared exact-origin CORS bootstrap | `development CORS allows the local origin and does not reflect another origin`; `production CORS emits only the configured exact origin` | PASS |
| S4-AC-04 | Global pipe, stable error factory, typed DTOs and ID/date validators | `missing anonymous input returns the frozen validation error shape`; `unknown body and query properties are rejected`; coordinate, boolean, strict-date/array, and path-identifier tests | PASS |
| S4-AC-05 | 401 guards, active-user lookup, controller 4xx exceptions, transactional identity creation | required-auth test; `a token for a non-active user is rejected with 401`; `domain failures are 4xx...`; `concurrent anonymous auth converges on one identity and one user`; retained Slice 2 cross-user 404 tests | PASS |
| S4-AC-06 | Throttler global/endpoint limits, IP tracker, one-hop trust, Nginx forwarding replacement | `uses real connection identity rather than forwarded-header values`; `blocks forged bucket rotation with 429 and Retry-After`; production two-client ingress smoke | PASS |
| S4-AC-07 | `HealthModule`, minimal `User.count`, governed coherent tuple query | `liveness has no DB dependency...`; exact development/test/production-not-ready tests; `production ready requires a coherent approved Crop + EnvironmentRequirement + SowingCalendar` | PASS |
| S4-AC-08 | Existing governance filter plus production content smoke | governance 10/10; Slice 3 `production: draft seasonal crops are not served` and `approved Crop cannot use a draft SowingCalendar`; production smoke empty reads | PASS |
| S4-AC-09 | Multi-stage server image and local-CLI entrypoint | Final image build, UID/artifact/healthcheck checks, initial + idempotent migrations, invalid-DB failure | PASS |
| S4-AC-10 | Multi-stage H5 image and unprivileged Nginx API/static configuration | Final H5 build, UID/healthcheck, all HTTP smoke probes through `/api`, Playwright 4/4 | PASS |
| S4-AC-11 | `docker-compose.production.yml` | Compose config PASS; smoke proves health ordering, named isolated volume, only H5 binding, no seed | PASS |
| S4-AC-12 | `.github/workflows/ci.yml` | `actionlint` PASS; every workflow command executed locally, including final production smoke | PASS |
| S4-AC-13 | entrypoint and `migration-upgrade-test.js` | Fresh DB in `test:all`; Slice2->current preservation PASS; second deploy PASS; smoke invalid DB nonzero; static startup-path inspection | PASS |
| S4-AC-14 | Shared bootstrap across all API tests and canonical root gate | 50 unit, 108 integration/gate, API full-chain, H5 2, Playwright 4; no frozen engine assertion removed | PASS |
| S4-AC-15 | Current root README, package metadata, full `.env.example` | README documents features, non-ready content, dev/test/prod, every runtime variable, Compose/migration/health, and final counts | PASS |
| S4-AC-16 | `.dockerignore`, non-secret runtime injection, safe logs/health, static scans | No tracked env/artifacts, no candidate absolute paths, no source `process.env`, no Prisma/seed change, clean server image | PASS |

## 7. CI Execution Note

Hosted GitHub Actions executed through PR #1:
`https://github.com/xu2099xu-png/terrace-grow-slice1/pull/1`. Process
documentation commit `6bd0d4b` created the PR for the original Slice 4 code
candidate, `7919bf867b1c33ca7dd089a7a211a7ed75416a39`.

The first hosted run, `31292532617`, failed only on the Playwright
`S2-E2E-02` navigation race inside `test-build-smoke`. The closure fix
addressed that race in `e2e/planting.spec.ts` by changing one fixed 1500ms wait
to deterministic `waitForURL` and adding the same deterministic wait on the
second path. No assertion was removed. That fix produced the final Slice 4 code
candidate `853852d1d1c118f2f6765b280c4f0ef3d3299a29`.

Hosted run `31292692456`, job `test-build-smoke`, completed SUCCESS:
`https://github.com/xu2099xu-png/terrace-grow-slice1/actions/runs/31292692456`.

Process-only documentation commit `780cbf6433510a23ed9c14f21a7a2e086b2e6370`
tightened `AGENTS.md` delegation rules without changing product code. Hosted
run `31292965604`, job `test-build-smoke`, completed SUCCESS on that PR head:
`https://github.com/xu2099xu-png/terrace-grow-slice1/actions/runs/31292965604`.
It succeeded all steps, including 50 unit tests, 108 integration/API/H5 tests,
4 Playwright tests, Slice 2 migration upgrade, build, Compose validation, image
builds, and production smoke.

## 8. Expected Product State

- Infrastructure: ready after migrations and database schema query.
- Agricultural content: `not_ready` in production for the repository's current
  draft-only seed.
- Production launch: intentionally blocked pending separately governed,
  expert-approved content.
- Remaining topology constraint: rate limiting is process-local and supports
  the frozen single-API-replica architecture only.

## 9. Independent Review Target

Review code and behavior at exactly:

**`853852d1d1c118f2f6765b280c4f0ef3d3299a29`**

The earlier `7919bf867b1c33ca7dd089a7a211a7ed75416a39` candidate remains
historical context for the first hosted CI failure. The later report-only commit
must not be treated as a replacement code candidate.

# Slice 5 Delivery Report - Grounded AI Explanation

> Overall status: **CANDIDATE / PENDING EXTERNAL AUDIT**
> Contract snapshot: `Slice5-Acceptance-Criteria-v1.0.md` and
> `Slice5-Implementation-Plan-v1.0.md`
> Slice 4 baseline product candidate:
> `853852d1d1c118f2f6765b280c4f0ef3d3299a29`
> Slice 5 product candidate:
> `beefc986fb6b5c0621209022e824e7a02b6aebbb`
> PR: `#2`
> Hosted CI: **SUCCESS**, run `31306433332`, job `93227456624`, head SHA
> `beefc986fb6b5c0621209022e824e7a02b6aebbb`

This report records implementation and execution evidence for the exact Slice 5
product candidate above. It does not supersede the Slice 4 baseline. It does not
contain raw prompts, raw user questions, provider keys, JWTs, database URLs,
cache keys, or secrets.

## 0. External Audit State

Independent local review result before external audit: **Blocking = 0**.

- Architecture/foundation/code audit: Blocking = 0.
- Backend core and provider/cache/rate-limit audit: Blocking = 0.
- H5 and Playwright journey audit: Blocking = 0 after baseline closures.
- External Claude audit remains pending and is the remaining acceptance signal.
- Hosted CI run `31306433332`, job `93227456624`, completed successfully for
  product candidate `beefc986fb6b5c0621209022e824e7a02b6aebbb`.
- Hosted CI covered full test execution, Slice 5 focused gate, migration
  upgrade checks, root/server/H5 builds, production Compose config, production
  image builds, and production smoke.
- The first `git push` attempt in the delivery environment failed with LibreSSL
  `SSL_ERROR_SYSCALL`; the later push succeeded.

## 1. Superseded Candidate History

- Old candidate `8e1e73e6ac58abe8749251d310a7162ef15b3698` was superseded by
  root new-user baseline self-check findings and is no longer the audit target.
- Intermediate hosted CI run `31306092554` for head `7143688` failed because a
  Vant test teardown left a pending timer. That was a test-only failure.
- The test-only `beefc98` fix added strict H5 repeat execution stability; hosted
  CI run `31306433332` then completed successfully for the current candidate.

## 2. Scope Integrity

- Slice 5 starts from Slice 4 baseline
  `853852d1d1c118f2f6765b280c4f0ef3d3299a29`.
- The Slice 5 product candidate is
  `beefc986fb6b5c0621209022e824e7a02b6aebbb`.
- The only Slice 5 AI product loop is grounded AI explanation for existing
  results.
- Root baseline closure also repaired H5 first-user fundamentals without adding
  new agricultural facts or changing engine outputs.
- No provider-side tool/function calling, RAG/vector DB, open-domain chat,
  multi-turn memory, content review back office, image diagnosis, push,
  mini-program, ecommerce, new crop, new variety, new lifecycle template, new
  sowing calendar, or new agricultural fact seed data was added.
- AI prose is not used by recommendation, seasonal, soil, weather, lifecycle, or
  governance approval paths.
- Production smoke ran with `APP_ENV=production` and `AI_PROVIDER=off`.
- No real provider key was used in local gates, smoke, browser tests, or hosted
  CI.

## 3. Delivered Architecture

- Backend exposes one authenticated endpoint: `POST /api/ai/ask`.
- H5 sends only typed context references and a bounded question. The server
  re-resolves all facts through existing service/governance paths.
- Server internal resolvers:
  - `perennial_plan` -> `RecommendationDataService.build`.
  - `seasonal_item` -> `SeasonsService.now`.
  - `planting_now` -> `PlantingsService.now`.
- Provider adapter implements an OpenAI-compatible `/chat/completions` contract
  snapshot dated `2026-08-09`.
- Local validation is the safety boundary: exact provider JSON schema, citation
  validation, positive lexical grounding, number/date/percentage/unit trace, and
  plain-text-only output.
- AI cache is PostgreSQL-backed and stores only exact validated public answered
  AI responses.
- AI endpoint has local per-user throttling after auth and a provider daily cap.
- H5 integrates one shared bottom sheet on three existing AI pages:
  `PerennialPlan.vue`, `SeasonalNow.vue`, and `PlantingDetail.vue`.

## 4. Baseline Closure Evidence

Root new-user baseline self-check superseded the old candidate and closed the
following non-AI product blockers before this report candidate:

- Anonymous identity bootstrap: first App visit creates and persists a stable
  `device_id` and anonymous token before route content renders.
- 401 once retry: stale/invalid token responses rebuild anonymous identity once
  and retry the original request; 403 is not disguised as anonymous recovery.
- Home to target crop: fresh 首页 -> 建档 -> target `crop-grape` returns to
  the grape perennial plan instead of hardcoded blueberry.
- Mine baseline: Mine owns profile create/edit, materials checkbox
  selection+save, and planting list/empty state; App no longer duplicates
  terrace state or CTA.
- Seasonal city/empty recovery: city selection and empty seasonal states were
  made discoverable without breaking existing seasonal AI entry behavior.
- Perennial stale route: same-component crop route changes no longer show stale
  blueberry plan content on grape URLs.
- PlantingStart loading/double-submit: start confirmation avoids premature or
  repeated submits while data is loading/submitting.
- AI HTTP errors: H5 no longer fabricates a rules fallback response for non-429
  HTTP errors; backend public contract remains authoritative.
- Viewport zoom: removed maximum-scale/user-scalable restriction so user zoom
  remains available; mobile visual audit completed.

New Playwright coverage includes:

- `baseline onboarding: fresh home creates identity and builds target grape terrace plan`.
- `baseline onboarding: fresh mine stays on mine and shows terrace CTA`.
- `B-E2E-01 plan route crop change ignores stale previous response`.

## 5. Automated Results

Hosted CI run `31306433332` is the authoritative remote execution record for
candidate `beefc986fb6b5c0621209022e824e7a02b6aebbb`.

| Gate | Evidence state |
| --- | --- |
| Hosted CI run `31306433332`, job `93227456624` | Completed successfully for head SHA `beefc986fb6b5c0621209022e824e7a02b6aebbb` |
| Server unit | 8 files / 86 tests |
| Server integration | 8 files / 127 tests |
| API full-chain E2E | Completed in hosted CI |
| H5 unit | 41 tests |
| Playwright browser | 10 tests, including new onboarding and plan-route-state coverage |
| `test:slice5-gate` | Completed in hosted CI |
| Migration upgrade | Fresh DB, Slice 2 baseline DB, Slice 4 exact SHA DB, and second deploy idempotence completed |
| Root/server/H5 builds | Completed in hosted CI |
| Production Compose config | Completed in hosted CI |
| Production images | Server and H5 images built in hosted CI |
| Production smoke | Completed with `APP_ENV=production` and `AI_PROVIDER=off` |

Browser evidence includes all three AI entry points, provider failure fallback,
new-user onboarding, same-component plan route stability, Mine CTA, and target
grape plan navigation. No automated gate required a real provider key.

## 6. Container and Production Smoke Evidence

Production smoke ran with AI disabled by configuration:

```text
APP_ENV=production
AI_PROVIDER=off
```

The smoke proved:

- application health semantics remain independent of AI provider readiness,
- production draft-only content is not exposed through AI explanations,
- server and H5 production images build and start,
- Compose config is valid,
- production startup does not require provider key/base/model when AI is off,
- smoke paths complete without a real provider key.

## 7. Migration Evidence

Slice 5 adds AI infrastructure tables only. Migration verification covered:

- fresh database to Slice 5,
- existing Slice 2 baseline database to Slice 5,
- database produced by Slice 4 product candidate
  `853852d1d1c118f2f6765b280c4f0ef3d3299a29` to Slice 5,
- second `prisma migrate deploy` idempotence.

Preservation checks covered:

- `User`,
- `UserIdentity`,
- `TerraceProfile`,
- `PlantingRecord`,
- `PlantingEvent`,
- `UserMaterialInventory`.

The AI cache table is not an agricultural fact table and is not governed as
approved agricultural content.

## 8. AC Traceability

| AC | Implementation files | Exact automated evidence and asserted behavior | Evidence state |
| --- | --- | --- | --- |
| S5-AC-01 | `Slice5-Acceptance-Criteria-v1.0.md`, `Slice5-Implementation-Plan-v1.0.md`, scoped Slice 5 code under `server/src/ai/**`, H5 AI and baseline pages | Delivery identifies baseline `853852d1d1c118f2f6765b280c4f0ef3d3299a29` and candidate `beefc986fb6b5c0621209022e824e7a02b6aebbb`; hosted CI run `31306433332` completed for candidate SHA | Covered locally and in hosted CI; pending external audit |
| S5-AC-02 | `server/src/ai/ai.controller.ts`, `server/src/ai/ai.module.ts`, existing global `AuthGuard`, `PlantingsService.now` via resolver | `returns 401 for missing and malformed auth before the AI limiter`; `preserves planting missing and cross-user ownership as 404`; Playwright `S5-E2E-03 planting current-stage explanation keeps action completion usable` | Covered locally and in hosted CI; pending external audit |
| S5-AC-03 | `server/src/ai/dto/ask-ai.dto.ts`, global Slice 4 validation pipe, `h5/src/components/AiExplanationPanel.vue` | `validates exact discriminated request fields and trims question`; `rejects selected null and mixed context fields`; `uses Slice 4 validation shape for unknown fields`; H5 tests post exact perennial/seasonal/planting typed refs without agricultural fact payloads | Covered locally and in hosted CI; pending external audit |
| S5-AC-04 | `server/src/ai/ai.controller.ts`, `server/src/ai/ai.service.ts`, `server/src/ai/ai.types.ts` | `returns exact HTTP 200 and exact public top-level keys for a valid request`; cache hit/off/cap/provider success/provider failure state precedence; H5 state rendering covers answered, disabled, provider-unavailable, insufficient-data, and 429 | Covered locally and in hosted CI; pending external audit |
| S5-AC-05 | `server/src/ai/ai.service.ts`, `server/src/ai/context/ai-context-resolver.service.ts`, production smoke | `returns insufficient_data before cache or provider work`; production smoke verifies draft-only production content is not exposed through AI explanations when AI is off | Covered locally and in hosted CI; pending external audit |
| S5-AC-06 | `server/src/ai/context/ai-context-resolver.service.ts`, `server/src/ai/provider/*` | Source review confirms fixed internal resolver dispatch and no provider tool/function-calling registration; ungrounded facts return insufficient_data before cache/provider | Covered by source review plus tests; pending external audit |
| S5-AC-07 | `server/src/ai/context/ai-context-resolver.service.ts`, `server/src/recommendations/recommendation-data.service.ts`, H5 perennial wiring | H5 test `AI explanation sends current plan refs only after user submits`; Playwright `S5-E2E-01 perennial plan explanation posts refs and renders cited response`; baseline closure adds plan-route-state stale response coverage | Covered locally and in hosted CI; pending external audit |
| S5-AC-08 | `server/src/ai/provider/openai-compatible.provider.ts`, `server/src/ai/provider/ai-provider.service.ts`, `server/src/ai/provider/mock-ai.provider.ts` | OpenAI-compatible request/parse contract without streaming/tool calling; provider success/failure tests confirm public fallback behavior without server 500 | Covered by source review plus tests; pending external audit |
| S5-AC-09 | `server/src/ai/validation/ai-output.validator.ts`, `server/src/ai/provider/mock-ai.provider.ts`, `server/src/ai/rules-answer.service.ts` | `accepts plain sentences grounded by cited facts`; rejects provider warnings, unknown provider fields, invalid sentinel fact ids, and invalid output before caching | Covered locally and in hosted CI; pending external audit |
| S5-AC-10 | `server/src/ai/validation/ai-output.validator.ts`, `server/src/ai/context/ai-facts.ts`, `server/src/ai/ai.service.ts` | Rejects uncited or context-external domain terms, enum tokens, numbers, dates, percentages, unit quantities, HTML, markdown, and URLs | Covered locally and in hosted CI; pending external audit |
| S5-AC-11 | `server/src/config/runtime-config.ts`, `server/src/config/runtime-config.spec.ts`, `server/src/ai/ai-runtime-config.service.ts` | Runtime config tests cover default `AI_PROVIDER=off`, provider required config, and production mock rejection; production smoke proves off mode needs no provider config | Covered locally and in hosted CI; pending external audit |
| S5-AC-12 | `server/prisma/schema.prisma`, Slice 5 migration, `server/src/ai/cache/ai-cache.service.ts`, `server/src/ai/ai.service.ts` | Cache key/hash tests cover provider/model/prompt version, normalized question hash, privacy-bearing field rejection, validated answered-only writes, and concurrent unique conflict re-read | Covered locally and in hosted CI; pending external audit |
| S5-AC-13 | `server/src/ai/rate-limit/ai-rate-limit.guard.ts`, `server/src/ai/rate-limit/ai-rate-limit.service.ts`, `server/src/ai/usage/ai-provider-usage.service.ts`, `server/src/ai/ai.service.ts` | Per-user bucket by `req.userId`, `Retry-After` on 429, IP/XFF ignored, Asia/Shanghai daily boundary, atomic provider cap reservation, daily cap disabled rules fallback | Covered locally and in hosted CI; pending external audit |
| S5-AC-14 | `server/src/ai/context/ai-context-resolver.service.ts`, existing governed data services, production config, smoke | Draft-only production content returns insufficient_data/off behavior and does not enter prompt, provider, cache, citations, warnings, or answer | Covered locally and in hosted CI; pending external audit |
| S5-AC-15 | `h5/src/components/AiExplanationPanel.vue`, `h5/src/views/PerennialPlan.vue`, `h5/src/views/SeasonalNow.vue`, `h5/src/views/PlantingDetail.vue`, baseline H5 pages | H5 tests cover exact typed refs, display states, 429, plain-text escaping, HTTP error handling; Playwright covers AI entries plus onboarding, Mine CTA, seasonal recovery, and plan-route-state | Covered locally and in hosted CI; pending external audit |
| S5-AC-16 | Existing `server/src/health/**`, AI modules not connected to health readiness, production smoke | Production smoke verifies health remains available with `AI_PROVIDER=off`; source review confirms AI provider readiness is not added to health readiness | Covered by smoke plus source review; pending external audit |
| S5-AC-17 | Slice 5 Prisma migration, `server/scripts/migration-upgrade-test.js`, Prisma schema | Migration verification covers fresh DB, Slice 2 baseline DB, Slice 4 exact SHA DB, second deploy idempotence, and preservation of User/UserIdentity/TerraceProfile/PlantingRecord/PlantingEvent/UserMaterialInventory | Covered locally and in hosted CI; pending external audit |
| S5-AC-18 | Root scripts, server tests, H5 tests, Playwright tests, production Compose/smoke scripts | Hosted CI run `31306433332` completed full test, `test:slice5-gate`, migration, build, Compose config, production image build, and production smoke without a real provider key | Covered locally and in hosted CI; pending external audit |
| S5-AC-19 | AI DTO/service/validator/cache files, `h5/src/components/AiExplanationPanel.vue`, H5 baseline closure files | Exact typed DTO tests; validator rejects unsafe provider output; cache rejects privacy-bearing fields; H5 escapes text and no longer fabricates rules fallback for non-429 HTTP errors | Covered locally and in hosted CI; pending external audit |
| S5-AC-20 | AI resolver reads existing `PlantingsService.now`; no lifecycle engine/API contract edits; scoped AI endpoint limiter only | Playwright `S5-E2E-03 planting current-stage explanation keeps action completion usable`; baseline closure covers PlantingStart loading/double-submit without changing lifecycle contracts | Covered by source review plus tests; pending external audit |

## 9. H5 Journey Evidence

Playwright covered 10 browser tests, including:

- `S5-E2E-01 perennial plan explanation posts refs and renders cited response`.
- `S5-E2E-02 seasonal item explanation renders provider failure rules fallback without navigation loss`.
- `S5-E2E-03 planting current-stage explanation keeps action completion usable`.
- `baseline onboarding: fresh home creates identity and builds target grape terrace plan`.
- `baseline onboarding: fresh mine stays on mine and shows terrace CTA`.
- `B-E2E-01 plan route crop change ignores stale previous response`.

H5 unit coverage covered 41 tests, including:

- shared bottom sheet request-body construction,
- answered/cache/citation/warning display,
- disabled/provider-unavailable/insufficient display states,
- 429 display state,
- plain-text escaping,
- HTTP error handling without public contract fabrication,
- anonymous identity bootstrap and 401 once retry,
- Home pending terrace-status race,
- Mine profile-null CTA and materials,
- seasonal city/empty recovery,
- current plan selected refs,
- planting start loading/double-submit.

The H5 bottom sheet explicitly constrains and scrolls content on small screens.

## 10. Provider and CI Notes

- Provider contract snapshot date: `2026-08-09`.
- Real provider integration was not executed and is not required for this
  candidate gate.
- Mock provider was used for deterministic success and deterministic failure.
- Hosted CI run `31306433332`, job `93227456624`, completed successfully for PR
  `#2` and head SHA `beefc986fb6b5c0621209022e824e7a02b6aebbb`.
- Hosted CI emitted non-blocking annotations about `actions/checkout@v4` /
  `actions/setup-node@v4` Node 20 deprecation and forced Node 24 behavior.

## 11. Expected Product State

- Development/test: grounded AI explanation works with mock provider and draft
  fixtures under the explicit development draft gate.
- Production: AI defaults off and does not affect health readiness.
- Production with current draft-only seed: affected agricultural explanation
  contexts return `insufficient_data`; draft facts do not enter prompt, provider,
  cache, citations, warnings, or answer.
- Future real-provider enablement requires configured
  `AI_PROVIDER=openai_compatible` with validated base URL, key, model, timeout,
  prompt version, cache TTL, daily cap, endpoint limit, and endpoint TTL.

## 12. External Review Target

Review code and behavior at exactly:

**`beefc986fb6b5c0621209022e824e7a02b6aebbb`**

The Slice 4 baseline remains:

**`853852d1d1c118f2f6765b280c4f0ef3d3299a29`**

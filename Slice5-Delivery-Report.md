# Slice 5 Delivery Report - Grounded AI Explanation

> Overall status: **CANDIDATE / PENDING EXTERNAL AUDIT**
> Contract snapshot: `Slice5-Acceptance-Criteria-v1.0.md` and
> `Slice5-Implementation-Plan-v1.0.md`
> Slice 4 baseline product candidate:
> `853852d1d1c118f2f6765b280c4f0ef3d3299a29`
> Slice 5 product candidate:
> `8e1e73e6ac58abe8749251d310a7162ef15b3698`
> PR: `#2`
> Hosted CI: **PASS**, run `31301705820`, job `93215428989`, head SHA
> `8e1e73e6ac58abe8749251d310a7162ef15b3698`, duration `3m23s`

This report records implementation and execution evidence for the exact Slice 5
product candidate above. It does not supersede the Slice 4 baseline. It does not
contain raw prompts, raw user questions, provider keys, JWTs, database URLs,
cache keys, or secrets.

## 0. External Audit State

Independent local review result before external audit: **Blocking = 0**.

- Architecture/foundation/code audit: Blocking = 0.
- Backend core and provider/cache/rate-limit audit: Blocking = 0.
- H5 and Playwright journey audit: Blocking = 0.
- External Claude audit remains pending and is the remaining acceptance signal.
- First `git push` attempt failed with LibreSSL `SSL_ERROR_SYSCALL`; the second
  push succeeded and opened PR `#2`.
- Hosted CI run `31301705820` completed successfully for the exact product SHA
  above. CI annotations for `actions/checkout@v4` and `actions/setup-node@v4`
  mention Node 20 deprecation / forced Node 24 behavior; this is not a code
  failure.

## 1. Scope Integrity

- Slice 5 starts from Slice 4 baseline
  `853852d1d1c118f2f6765b280c4f0ef3d3299a29`.
- The only user-visible product loop is grounded AI explanation for existing
  results.
- No provider-side tool/function calling, RAG/vector DB, open-domain chat,
  multi-turn memory, content review back office, image diagnosis, push,
  mini-program, ecommerce, new crop, new variety, new lifecycle template, new
  sowing calendar, or new agricultural fact seed data was added.
- AI prose is not used by recommendation, seasonal, soil, weather, lifecycle, or
  governance approval paths.
- Production smoke ran with `APP_ENV=production` and `AI_PROVIDER=off`.
- No real provider key was used in local gates, smoke, browser tests, or hosted
  CI.

## 2. Delivered Architecture

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
- H5 integrates one shared bottom sheet on three existing pages:
  `PerennialPlan.vue`, `SeasonalNow.vue`, and `PlantingDetail.vue`.

## 3. Automated Results

Hosted CI for run `31301705820` completed successfully against the exact product
candidate SHA. Local commands used during candidate preparation also exited `0`;
the exact hosted CI log is the authoritative remote execution record for this
candidate.

| Command / gate | Evidence state |
| --- | --- |
| Hosted CI run `31301705820` | Completed successfully for head SHA `8e1e73e6ac58abe8749251d310a7162ef15b3698`; all steps including smoke completed |
| `npm run test:all` | Local candidate-preparation gate exited `0` |
| `npm run test:slice5-gate` | Local Slice 5 focused gate exited `0` |
| Migration verification | Fresh DB, Slice 2 baseline DB, Slice 4 exact SHA DB, and second deploy idempotence were exercised |
| Root build / server build / H5 build | Local candidate-preparation gates exited `0` |
| Production Compose / production images / production smoke | Hosted CI and local candidate-preparation gates completed with `APP_ENV=production` and `AI_PROVIDER=off` |

Browser evidence includes all three AI entry points and provider fallback. No
automated gate required a real provider key.

## 4. Container and Production Smoke Evidence

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

## 5. Migration Evidence

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

## 6. AC Traceability

| AC | Implementation files | Exact automated evidence and asserted behavior | Evidence state |
| --- | --- | --- | --- |
| S5-AC-01 | `Slice5-Acceptance-Criteria-v1.0.md`, `Slice5-Implementation-Plan-v1.0.md`, scoped Slice 5 code under `server/src/ai/**`, H5 AI component/pages | Delivery identifies baseline `853852d1d1c118f2f6765b280c4f0ef3d3299a29` and candidate `8e1e73e6ac58abe8749251d310a7162ef15b3698`; hosted CI completed for the candidate SHA | Covered locally and in hosted CI; pending external audit |
| S5-AC-02 | `server/src/ai/ai.controller.ts`, `server/src/ai/ai.module.ts`, existing global `AuthGuard`, `PlantingsService.now` via resolver | `returns 401 for missing and malformed auth before the AI limiter`; `preserves planting missing and cross-user ownership as 404`; Playwright `S5-E2E-03 planting current-stage explanation keeps action completion usable` | Covered locally and in hosted CI; pending external audit |
| S5-AC-03 | `server/src/ai/dto/ask-ai.dto.ts`, global Slice 4 validation pipe, `h5/src/components/AiExplanationPanel.vue` | `validates exact discriminated request fields and trims question`; `rejects selected null and mixed context fields`; `uses Slice 4 validation shape for unknown fields`; `keeps Slice 4 validation shape for unknown DTO fields`; H5 tests `posts exact perennial typed refs without agricultural facts`, `posts exact seasonal typed refs without recommendation facts`, and `posts exact planting typed refs without lifecycle facts` | Covered locally and in hosted CI; pending external audit |
| S5-AC-04 | `server/src/ai/ai.controller.ts`, `server/src/ai/ai.service.ts`, `server/src/ai/ai.types.ts` | `returns exact HTTP 200 and exact public top-level keys for a valid request`; `returns answered source ai on cache hit before cap and provider`; `AI_PROVIDER=off returns disabled rules and never reads cached AI`; `returns exact public provider success and provider failure fallback without 500`; H5 state rendering tests cover answered, disabled, provider-unavailable, insufficient-data, and 429 states | Covered locally and in hosted CI; pending external audit |
| S5-AC-05 | `server/src/ai/ai.service.ts`, `server/src/ai/context/ai-context-resolver.service.ts`, production smoke | `returns insufficient_data before cache or provider work`; production smoke verifies draft-only production content is not exposed through AI explanations when AI is off | Covered locally and in hosted CI; pending external audit |
| S5-AC-06 | `server/src/ai/context/ai-context-resolver.service.ts`, `server/src/ai/provider/*` | Source review confirms fixed internal resolver dispatch and no provider tool/function-calling registration; `returns insufficient_data before cache or provider work` covers resolver ordering before cache/provider for ungrounded facts | Covered by source review plus tests; pending external audit |
| S5-AC-07 | `server/src/ai/context/ai-context-resolver.service.ts`, `server/src/recommendations/recommendation-data.service.ts`, H5 perennial wiring | H5 test `AI explanation sends current plan refs only after user submits`; component test `posts exact perennial typed refs without agricultural facts`; Playwright `S5-E2E-01 perennial plan explanation posts refs and renders cited response`; source review confirms selected container/variety refs are passed into the recommendation data resolver | Covered locally and in hosted CI; pending external audit |
| S5-AC-08 | `server/src/ai/provider/openai-compatible.provider.ts`, `server/src/ai/provider/ai-provider.service.ts`, `server/src/ai/provider/mock-ai.provider.ts` | Source review confirms the OpenAI-compatible request/parse contract and absence of streaming/tool calling; server tests `returns exact public provider success and provider failure fallback without 500`, `provider invalid output returns provider_unavailable rules and does not cache`, and `mock provider parses a real fact_id and supports deterministic test-only failure` cover public success/fallback behavior | Covered by source review plus tests; pending external audit |
| S5-AC-09 | `server/src/ai/validation/ai-output.validator.ts`, `server/src/ai/provider/mock-ai.provider.ts`, `server/src/ai/rules-answer.service.ts` | `accepts plain sentences grounded by cited facts`; `rejects provider warnings and every unknown provider field`; `provider invalid output returns provider_unavailable rules and does not cache`; `provider output with sentinel fact id returns provider_unavailable rules and does not cache` | Covered locally and in hosted CI; pending external audit |
| S5-AC-10 | `server/src/ai/validation/ai-output.validator.ts`, `server/src/ai/context/ai-facts.ts`, `server/src/ai/ai.service.ts` | `rejects domain terms not present in the sentence cited facts`; `rejects context-external crop/entity tokens even when cited facts are otherwise valid`; `rejects uncited enum tokens under the positive sentence allowlist`; `rejects uncited numbers, dates, percentages, and unit quantities`; `rejects HTML markdown and URLs` | Covered locally and in hosted CI; pending external audit |
| S5-AC-11 | `server/src/config/runtime-config.ts`, `server/src/config/runtime-config.spec.ts`, `server/src/ai/ai-runtime-config.service.ts` | Runtime config tests cover `AI_PROVIDER=off` default and required config for provider mode; production smoke proves off mode does not require provider config; source review confirms no `AI_ENABLED` contract | Covered locally and in hosted CI; pending external audit |
| S5-AC-12 | `server/prisma/schema.prisma`, `server/prisma/migrations/20260809120000_slice5_ai_explanation/migration.sql`, `server/src/ai/cache/ai-cache.service.ts`, `server/src/ai/ai.service.ts` | Cache tests `builds a deterministic key hash including provider, model, and prompt version`, `normalizes only question text into a hash and never needs the raw question for cache key input`, `rejects non-cacheable public response shapes and privacy-bearing fields`, `writes only exact answered AI responses`, and `re-reads the winning cache row after a concurrent unique conflict`; gate test `uses the shared cache question hash for case and whitespace normalization` | Covered locally and in hosted CI; pending external audit |
| S5-AC-13 | `server/src/ai/rate-limit/ai-rate-limit.guard.ts`, `server/src/ai/rate-limit/ai-rate-limit.service.ts`, `server/src/ai/usage/ai-provider-usage.service.ts`, `server/src/ai/ai.service.ts` | `keys buckets by user id, not IP-like caller data`; `reads req.userId and sets Retry-After on 429`; `uses per-user AI 429 with Retry-After and ignores IP/XFF bucket rotation`; `uses Asia/Shanghai day boundaries`; `atomically reserves no more than the per-user daily cap under concurrency`; `daily cap returns disabled rules without provider call` | Covered locally and in hosted CI; pending external audit |
| S5-AC-14 | `server/src/ai/context/ai-context-resolver.service.ts`, existing governed data services, production config, smoke | `returns insufficient_data before cache or provider work`; production smoke with `AI_PROVIDER=off` confirms no draft-derived AI answer is produced in the production smoke path | Covered locally and in hosted CI; pending external audit |
| S5-AC-15 | `h5/src/components/AiExplanationPanel.vue`, `h5/src/views/PerennialPlan.vue`, `h5/src/views/SeasonalNow.vue`, `h5/src/views/PlantingDetail.vue` | H5 tests `posts exact perennial typed refs without agricultural facts`, `posts exact seasonal typed refs without recommendation facts`, `posts exact planting typed refs without lifecycle facts`, `renders answered status, cache marker, citations, and warnings`, `renders 429 rate-limit state`, and `escapes answer as plain text`; generated state cases cover disabled, provider-unavailable, and insufficient-data; Playwright S5-E2E-01/02/03 cover all entry points and fallback | Covered locally and in hosted CI; pending external audit |
| S5-AC-16 | Existing `server/src/health/**`, AI modules not connected to health readiness, production smoke | Production smoke verifies health remains available with `AI_PROVIDER=off`; source review confirms AI provider readiness is not added to health readiness | Covered by smoke plus source review; pending external audit |
| S5-AC-17 | `server/prisma/migrations/20260809120000_slice5_ai_explanation/migration.sql`, `server/scripts/migration-upgrade-test.js`, Prisma schema | Migration verification covers fresh DB, Slice 2 baseline DB, Slice 4 exact SHA DB, second deploy idempotence, and preservation of User/UserIdentity/TerraceProfile/PlantingRecord/PlantingEvent/UserMaterialInventory | Covered locally and in hosted CI; pending external audit |
| S5-AC-18 | Root scripts, server tests, H5 tests, Playwright tests, production Compose/smoke scripts | Hosted CI run `31301705820` completed all steps including smoke; local candidate-preparation gates included `test:all`, `test:slice5-gate`, root/server/H5 builds, Compose config, production image build, and production smoke without a real provider key | Covered locally and in hosted CI; pending external audit |
| S5-AC-19 | `server/src/ai/dto/ask-ai.dto.ts`, `server/src/ai/ai.service.ts`, `server/src/ai/validation/ai-output.validator.ts`, `server/src/ai/cache/ai-cache.service.ts`, `h5/src/components/AiExplanationPanel.vue` | Exact typed DTO tests constrain request shape; validator tests reject provider warnings, unknown fields, HTML, markdown, URLs, uncited terms, uncited enum tokens, uncited numbers, dates, percentages, and unit quantities; cache test rejects privacy-bearing fields; H5 test `escapes answer as plain text` | Covered locally and in hosted CI; pending external audit |
| S5-AC-20 | AI resolver reads existing `PlantingsService.now`; no lifecycle engine/API contract edits; scoped AI endpoint limiter only | Playwright `S5-E2E-03 planting current-stage explanation keeps action completion usable`; source review confirms Slice 5 did not add an ActiveAction implementation or change the existing planting-now API contract; AI limiter is scoped to the AI endpoint | Covered by source review plus tests; pending external audit |

## 7. H5 Journey Evidence

Playwright covered:

- `S5-E2E-01 perennial plan explanation posts refs and renders cited response`.
- `S5-E2E-02 seasonal item explanation renders provider failure rules fallback without
  navigation loss`.
- `S5-E2E-03 planting current-stage explanation keeps action completion usable`.

H5 unit coverage covered:

- shared bottom sheet request-body construction,
- answered/cache/citation/warning display,
- disabled/provider-unavailable/insufficient display states,
- 429 display state,
- plain-text escaping,
- current plan selected refs,
- seasonal card navigation,
- planting action completion after AI entry.

The H5 bottom sheet explicitly constrains and scrolls content on small screens.

## 8. Provider and CI Notes

- Provider contract snapshot date: `2026-08-09`.
- Real provider integration was not executed and is not required for this
  candidate gate.
- Mock provider was used for deterministic success and deterministic failure.
- Hosted CI run `31301705820` completed successfully for PR `#2` and head SHA
  `8e1e73e6ac58abe8749251d310a7162ef15b3698`.
- The first `git push` attempt failed with LibreSSL `SSL_ERROR_SYSCALL`; the
  second push succeeded.
- Hosted CI emitted a non-blocking annotation about `actions/checkout@v4` /
  `actions/setup-node@v4` Node 20 deprecation and forced Node 24 behavior.

## 9. Expected Product State

- Development/test: grounded AI explanation works with mock provider and draft
  fixtures under the explicit development draft gate.
- Production: AI defaults off and does not affect health readiness.
- Production with current draft-only seed: affected agricultural explanation
  contexts return `insufficient_data`; draft facts do not enter prompt, provider,
  cache, citations, warnings, or answer.
- Future real-provider enablement requires configured
  `AI_PROVIDER=openai_compatible` with validated base URL, key, model, timeout,
  prompt version, cache TTL, daily cap, endpoint limit, and endpoint TTL.

## 10. External Review Target

Review code and behavior at exactly:

**`8e1e73e6ac58abe8749251d310a7162ef15b3698`**

The Slice 4 baseline remains:

**`853852d1d1c118f2f6765b280c4f0ef3d3299a29`**

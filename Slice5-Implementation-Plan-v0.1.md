# Slice 5 Implementation Plan v0.1 - Grounded AI Explanation

> Status: DRAFT PLAN - aligned to `Slice5-Acceptance-Criteria-v0.1.md`.
> Baseline product candidate: `853852d1d1c118f2f6765b280c4f0ef3d3299a29`.
> Current main merge commit: `e65f05cd74abaacf44ac8ab4483ee558fb70acab`.

## 1. Architecture Decision

Slice 5 adds one user-visible grounded explanation loop for existing product
results. It explains rule-engine output in beginner-friendly language after the
core page has already rendered. It does not calculate, rank, filter, select, or
approve agricultural facts.

The only public AI endpoint is:

```text
POST /api/ai/ask
```

The endpoint uses the existing global `AuthGuard`. The server selects one fixed
internal resolver from the validated `context_type`:

```text
perennial_plan -> resolvePerennialPlanContext -> RecommendationDataService
seasonal_item  -> resolveSeasonalItemContext  -> SeasonsService
planting_now   -> resolvePlantingNowContext   -> PlantingsService
```

Resolvers reuse existing service and governance paths. The provider never
chooses resolvers, adds arguments, invokes server functions, or calls back into
the API. Provider-side function calling, open-ended tool-using Q&A, multi-agent
review, ContentReviewLog workflows, RAG, embeddings, and generated agricultural
content are deferred out of Slice 5.

The backend never trusts agricultural facts sent by H5. H5 sends only typed
context references and `question`; all facts are re-resolved on the server.

## 2. AC Index

- S5-AC-01: Scope and Slice 4 frozen baseline.
- S5-AC-02: Single AI endpoint and existing auth semantics.
- S5-AC-03: Discriminated typed request validation.
- S5-AC-04: Public response shape and status priority.
- S5-AC-05: Exact `insufficient_data` contract.
- S5-AC-06: Server internal resolvers, no provider-side tool calling.
- S5-AC-07: Perennial selected-id semantics.
- S5-AC-08: OpenAI-compatible provider minimal contract.
- S5-AC-09: Provider output schema and plain-text limits.
- S5-AC-10: Lexical grounding, citation, and trace validation.
- S5-AC-11: Unified AI configuration.
- S5-AC-12: PostgreSQL cache contract.
- S5-AC-13: AI-specific per-user endpoint limit and daily provider cap.
- S5-AC-14: Production draft-only isolation.
- S5-AC-15: H5 integration on three existing pages.
- S5-AC-16: Existing health semantics unchanged.
- S5-AC-17: Migration contract.
- S5-AC-18: CI, build, images, smoke, and regression.
- S5-AC-19: Prompt injection, privacy, and plain text.
- S5-AC-20: ActiveAction boundary and scope conflict rule.

## 3. Frozen Scope

Slice 5 must not:

- Start from a product baseline other than
  `853852d1d1c118f2f6765b280c4f0ef3d3299a29` plus process/report history.
- Add open-domain chat, multi-turn memory, provider-side function/tool calling,
  multi-agent content auditing, content-review back office, RAG, embeddings,
  vector storage, image diagnosis, push, mini-program work, ecommerce, or new
  cloud infrastructure.
- Add generated or approved agricultural facts, new crops, varieties, lifecycle
  templates, sowing calendars, or agricultural seed data.
- Modify existing perennial, seasonal, soil, sunlight, weather, lifecycle,
  governance, auth, validation, CORS, health, deployment, production-readiness,
  or global rate-limit semantics.
- Modify lifecycle API contracts or implement the v1.4 `ActiveAction` debt.
- Put AI prose into engines, governance approval, or agricultural fact tables.
- Depend on a real provider key for CI, smoke, or acceptance.

If any implementation task requires one of these changes, stop that work and
record a scope conflict before continuing.

## 4. Planned Dependencies

Use platform APIs and existing dependencies:

- Node 22 platform `fetch`, `AbortController`, and `crypto`.
- Existing NestJS guards, DTO validation style, Prisma, runtime config, and
  test bootstrap.
- Existing Vue/Vant/H5 API client.
- Hand-written runtime validation for provider JSON and public response shape.

No provider SDK and no frontend runtime dependency are added.

## 5. API Contract

### 5.1 Request DTO

The DTO is a custom discriminated union keyed by `context_type`. Unknown fields
return the frozen Slice 4 validation error shape.

Perennial plan:

```json
{
  "context_type": "perennial_plan",
  "question": "1-300 chars",
  "crop_id": "string",
  "selected_container_type_id": "string | omitted",
  "selected_variety_id": "string | omitted"
}
```

Seasonal item:

```json
{
  "context_type": "seasonal_item",
  "question": "1-300 chars",
  "city_code": "string",
  "crop_id": "string"
}
```

Planting now:

```json
{
  "context_type": "planting_now",
  "question": "1-300 chars",
  "planting_id": "string"
}
```

The endpoint rejects request bodies containing arbitrary tool arguments,
agricultural facts, calculated facts, weather facts, soil ratios, dates to
interpret, lifecycle actions, crop attributes, provider fields, or fields from
another context shape.

`selected_container_type_id` and `selected_variety_id` are string fields when
present. `null` is rejected.

### 5.2 Public Response

Every valid request returns HTTP 200 with exactly these public fields:

```json
{
  "status": "answered | disabled | provider_unavailable | insufficient_data",
  "answer": "string",
  "source": "ai | rules",
  "cache_hit": false,
  "citations": [
    {
      "fact_id": "string",
      "label": "string",
      "value": "string | number | boolean",
      "unit": "string | null"
    }
  ],
  "warnings": ["string"]
}
```

The response must not expose provider metadata, prompt text, raw question,
internal resolver payloads, user id, cache key, or raw provider content.

### 5.3 Status Priority

The endpoint resolves states in this order:

1. Required auth failure: existing 401.
2. Request validation failure: existing 400 validation shape.
3. Cross-user `planting_now`: existing non-enumerating 404.
4. No grounded context: exact `insufficient_data`; no provider call, no prompt,
   no cache write.
5. `AI_PROVIDER=off`: `disabled`, `source="rules"`, `cache_hit=false`; cache is
   not served when the provider is off.
6. Successful cache hit: `answered`, `source="ai"`, `cache_hit=true`.
7. Daily provider cap exhausted: `disabled`, `source="rules"`,
   `cache_hit=false`.
8. Provider failure, timeout, invalid JSON, schema failure, citation failure, or
   trace failure: `provider_unavailable`, `source="rules"`.
9. Successful validated provider output: `answered`, `source="ai"`,
   `cache_hit=false`, then cache write.

Endpoint throttling is separate: over-limit requests return HTTP 429 with
`Retry-After`.

### 5.4 Exact `insufficient_data`

The exact response is:

```json
{
  "status": "insufficient_data",
  "answer": "",
  "source": "rules",
  "cache_hit": false,
  "citations": [],
  "warnings": ["generic non-fact warning"]
}
```

The warning is generated by server state logic and must not disclose
agricultural facts. Production draft-only agricultural content must reach this
contract for affected contexts.

## 6. Provider Contract

For `AI_PROVIDER=openai_compatible`, the adapter sends:

```text
POST ${AI_PROVIDER_BASE_URL}/chat/completions
Authorization: Bearer <server key>
Content-Type: application/json
```

Request body:

```json
{
  "model": "<AI_PROVIDER_MODEL>",
  "messages": [
    { "role": "system", "content": "<system grounding instructions>" },
    { "role": "user", "content": "<server compact context/citations/question/instructions>" }
  ],
  "temperature": 0,
  "stream": false,
  "response_format": { "type": "json_object" }
}
```

`messages` is non-empty and contains at least one `system` message and one
`user` message. The `user` message contains only server-built compact context,
citations, the raw user question as untrusted text, and output instructions. It
does not contain secrets, JWTs, database URLs, provider keys, raw unrestricted
resolver payloads, or draft facts.

The adapter parses `choices[0].message.content` as a string, then parses that
string as JSON.

The provider is asked to return exactly:

```json
{
  "sentences": [
    { "text": "string", "fact_ids": ["string"] }
  ]
}
```

Provider output validation:

- `sentences` has 1-5 items.
- Sentence `text` has 1-160 chars.
- Each sentence has 1-5 `fact_ids`.
- Every `fact_id` exists in resolver facts.
- Final public `answer` has 1-800 chars after backend joins sentences.
- Public citations have 0-12 items.
- Unknown provider output fields are rejected.
- Provider output containing `warnings`, citations, status, source, cache
  fields, metadata, HTML, Markdown, URLs, code blocks, or tool-call-like data is
  rejected.

Public `warnings[]` is generated only by server state machine and server-owned
resolvers. Provider text never populates public warnings.

Missing content, non-string content, empty content, invalid JSON, empty JSON
object, HTTP failure, timeout, and thrown adapter errors return
`provider_unavailable` with a rules-sourced answer when grounded context exists.

## 7. Lexical Grounding and Trace Validation

The provider prompt instructs the model to rewrite only cited facts. The local
validator is the security boundary.

Before public `status="answered"`, validation proves:

- Every sentence cites at least one resolver fact.
- Every public citation maps to an existing resolver fact.
- Public citation value exactly matches the resolver fact value.
- Any crop, variety, material, lifecycle stage, action, start method, weather
  status, season status, suitability status, container type, soil material, or
  domain enumeration token in a sentence exists in that sentence's cited facts'
  server-owned `allowed_terms`.
- Any number in a sentence matches that sentence's cited facts.
- Any date in a sentence matches that sentence's cited facts.
- Any percentage in a sentence matches that sentence's cited facts.
- Any unit-bearing quantity in a sentence matches that sentence's cited facts.
- No uncited agricultural recommendation, ratio, pH target, month/window,
  lifecycle action, weather fact, container quantity, or soil quantity appears.

This is a structural and lexical safety boundary. It does not claim to prove
natural-language semantic entailment. AI prose is never an agricultural fact,
never enters any engine, and never contributes to governance approval.

## 8. Context Resolvers

Resolvers produce:

- citable facts,
- `allowed_terms` scoped per fact or sentence,
- server-generated generic warnings,
- canonical context hash material.

### 8.1 `resolvePerennialPlanContext`

Inputs: `userId`, `crop_id`, `selected_container_type_id`,
`selected_variety_id`.

Implementation:

- Call `RecommendationDataService.build(userId, crop_id, opts)`.
- Pass selected IDs through `opts`.
- Treat selected IDs as references only; they never carry facts.
- Return `insufficient_data` when the service returns null or no citable facts.
- Build citations from returned plan fields only.

### 8.2 `resolveSeasonalItemContext`

Inputs: `userId`, `city_code`, `crop_id`.

Implementation:

- Call `SeasonsService.now(city_code, userId)`.
- Select the item by `crop_id`.
- Cite only the service response fields.
- Return `insufficient_data` for unsupported climate, absent item, or no
  governed seasonal context.

No direct WeatherProvider call and no direct seasonal engine call.

### 8.3 `resolvePlantingNowContext`

Inputs: `userId`, `planting_id`.

Implementation:

- Call `PlantingsService.now(userId, planting_id)`.
- Preserve existing cross-user 404 behavior.
- Cite only the service response fields.
- Return `insufficient_data` when no citable lifecycle facts remain.

No direct lifecycle inference and no `ActiveAction` implementation.

## 9. Rules-Sourced Answer

Rules-sourced answer is deterministic text assembled from server citations. It
is used for:

- `AI_PROVIDER=off` with grounded context.
- Daily provider cap exhaustion with grounded context.
- Provider failure or rejected output with grounded context.

Rules-sourced answer uses public `source="rules"`. H5 maps this to either
`disabled rules fallback` or `provider_unavailable rules fallback` according to
the public response. The H5 rules label is never serialized as an API enum
value.

Rules-sourced answer is not written to cache and must pass the same plain-text
and trace validators.

## 10. Configuration

Add exactly these runtime variables:

- `AI_PROVIDER=off|mock|openai_compatible`
- `AI_PROVIDER_BASE_URL`
- `AI_PROVIDER_API_KEY`
- `AI_PROVIDER_MODEL`
- `AI_PROVIDER_TIMEOUT_MS`
- `AI_PROMPT_VERSION`
- `AI_EXPLANATION_CACHE_TTL_SECONDS`
- `AI_DAILY_PROVIDER_CALL_CAP`
- `AI_ENDPOINT_LIMIT`
- `AI_ENDPOINT_TTL_MS`

Defaults:

- `AI_PROVIDER=off`.

Rules:

- `off` may omit provider connection fields.
- `mock` is rejected in production.
- `openai_compatible` validates base URL, API key, model, timeout, prompt
  version, cache TTL, daily cap, endpoint limit, and endpoint TTL.
- No `AI_ENABLED` or second naming scheme.
- Config errors name variables and never echo secrets.

## 11. Cache and Daily Cap Data Model

### 11.1 `AiExplanationCache`

```prisma
model AiExplanationCache {
  id            String   @id @default(uuid())
  userId        String
  cacheKeyHash  String   @unique
  responseJson  Json
  provider      String
  model         String
  promptVersion String
  createdAt     DateTime @default(now())
  expiresAt     DateTime

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([expiresAt])
}
```

`cacheKeyHash` covers `userId`, context type, context reference fields,
canonical context hash, normalized question hash, provider, model, and prompt
version.

Cache lookup runs only after a grounded context is available and
`AI_PROVIDER=off` has been ruled out. Cache writes store only successful, fully
validated AI `answered` outputs. Cache rows do not store raw question, raw
prompt, raw resolver context, JWT,
Authorization header, provider key, database URL, or cache key source material.

On cache read, the service returns the stored public response with
`cache_hit=true` and `source="ai"`.

### 11.2 `AiProviderUsageDay`

```prisma
model AiProviderUsageDay {
  id        String   @id @default(uuid())
  userId    String
  day       String
  provider  String
  callCount Int      @default(0)
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@unique([userId, day, provider])
}
```

The day is Asia/Shanghai `YYYY-MM-DD`. The cap check atomically creates or
increments this row before provider call. Exhausted cap returns HTTP 200
`disabled`, `source="rules"`, `cache_hit=false`, and no provider call.

## 12. AI-Specific Endpoint Limiter

Do not change Slice 4 global throttler semantics.

Add method/controller-level protection:

- `AiRateLimitGuard`
- `AiRateLimitService`

The guard runs after `AuthGuard`, reads `req.userId`, uses
`AI_ENDPOINT_LIMIT`/`AI_ENDPOINT_TTL_MS`, and returns HTTP 429 with
`Retry-After` when exceeded. Buckets are keyed only by user id, not IP,
forwarded headers, device id, or request-supplied fields.

## 13. H5 Integration

Add one shared bottom sheet component used by:

- `PerennialPlan.vue`
- `SeasonalNow.vue`
- `PlantingDetail.vue`

UI states:

- loading,
- answered,
- disabled rules fallback,
- provider unavailable rules fallback,
- insufficient data,
- 429.

The core page renders before any AI request. AI controls must not block initial
page data, navigation, planting actions, material updates, or seasonal list
rendering. H5 renders `answer` as plain text only and never sends copied plan,
seasonal, planting, weather, soil, or lifecycle facts to the API.

## 14. Health and Production Smoke

Do not add provider-readiness logic to health decisions and do not add an AI
provider health endpoint.

Tests must prove existing health semantics are unchanged when:

- `AI_PROVIDER=off`,
- provider config is absent because provider is off,
- provider timeout occurs,
- daily cap is exhausted.

Production smoke with draft-only/no approved governed content must get
`/api/ai/ask` `status="insufficient_data"` for affected contexts. Integration
tests with governed development or approved context must prove
`AI_PROVIDER=off` returns `status="disabled"` and `source="rules"`.

## 15. Expected Files

Server:

```text
server/prisma/schema.prisma
server/prisma/migrations/<timestamp>_slice5_ai_explanation/migration.sql
server/src/config/runtime-config.ts
server/src/config/runtime-config.spec.ts
server/src/ai/ai.module.ts
server/src/ai/ai.controller.ts
server/src/ai/ai.service.ts
server/src/ai/dto/ask-ai.dto.ts
server/src/ai/ai.types.ts
server/src/ai/context/ai-context-resolver.service.ts
server/src/ai/context/perennial-plan.resolver.ts
server/src/ai/context/seasonal-item.resolver.ts
server/src/ai/context/planting-now.resolver.ts
server/src/ai/citations/citation-builder.ts
server/src/ai/provider/ai-provider.interface.ts
server/src/ai/provider/off-ai.provider.ts
server/src/ai/provider/mock-ai.provider.ts
server/src/ai/provider/openai-compatible.provider.ts
server/src/ai/validation/provider-json.validator.ts
server/src/ai/validation/trace.validator.ts
server/src/ai/rules/rules-answer.service.ts
server/src/ai/cache/ai-cache.service.ts
server/src/ai/usage/ai-provider-usage.service.ts
server/src/ai/rate-limit/ai-rate-limit.guard.ts
server/src/ai/rate-limit/ai-rate-limit.service.ts
server/test/slice5-gate.spec.ts
server/scripts/migration-upgrade-test.js
```

H5 / E2E:

```text
h5/src/components/AiExplanationPanel.vue
h5/src/components/AiExplanationPanel.spec.ts
h5/src/api/client.ts
h5/src/views/PerennialPlan.vue
h5/src/views/SeasonalNow.vue
h5/src/views/PlantingDetail.vue
e2e/ai-explanation.spec.ts
```

Ops/docs:

```text
README.md
server/.env.example
scripts/production-smoke.sh
.github/workflows/ci.yml
Slice5-Delivery-Report.md
```

No health controller/service file is expected for Slice 5.

## 16. Work Packages and AC Mapping

### WP-1 Contract red tests

Maps to S5-AC-01, S5-AC-02, S5-AC-03, S5-AC-04, S5-AC-05,
S5-AC-20.

- Add `slice5-gate` red tests for endpoint/auth, typed request validation,
  public response shape, status priority, exact `insufficient_data`, and scope
  conflict boundaries.

### WP-2 Prisma migration and config

Maps to S5-AC-11, S5-AC-12, S5-AC-13, S5-AC-17.

- Add cache and daily usage tables.
- Extend runtime config with exact names.
- Add migration verification paths and idempotence checks.

### WP-3 AI endpoint and limiter

Maps to S5-AC-02, S5-AC-03, S5-AC-04, S5-AC-13.

- Add `AiModule`, controller, DTO, custom validator, and AI-specific user-id
  limiter.

### WP-4 Internal resolvers

Maps to S5-AC-06, S5-AC-07, S5-AC-14, S5-AC-20.

- Add fixed resolvers through existing services.
- Build facts, citations, and allowed terms from governed service responses.
- Preserve cross-user planting 404 and lifecycle API behavior.

### WP-5 Provider adapter and output validation

Maps to S5-AC-08, S5-AC-09, S5-AC-10, S5-AC-19.

- Add off/mock/openai-compatible providers.
- Enforce exact `/chat/completions` contract.
- Validate internal `{sentences:[{text,fact_ids}]}` schema.
- Reject unknown provider fields and unsafe output.
- Add lexical trace validator.

### WP-6 Rules-sourced answer, cache, and cap

Maps to S5-AC-04, S5-AC-05, S5-AC-10, S5-AC-12, S5-AC-13.

- Generate deterministic rules-sourced answers.
- Cache successful validated AI answers only.
- Implement atomic daily cap.
- Preserve exact public response shape.

### WP-7 H5 shared component

Maps to S5-AC-03, S5-AC-04, S5-AC-15, S5-AC-19.

- Add shared bottom sheet.
- Wire all three pages.
- Render plain text and citations.
- Use fallback UI state from `source="rules"`.

### WP-8 Health, smoke, CI, and documentation

Maps to S5-AC-14, S5-AC-16, S5-AC-17, S5-AC-18, S5-AC-19.

- Add tests proving health is unaffected.
- Extend production smoke for draft-only `insufficient_data`.
- Extend CI and README.
- Add prompt/privacy/static checks.

## 17. Test Matrix

### Unit

- Config defaults and production validation: S5-AC-11.
- DTO discriminated validation: S5-AC-03.
- Provider HTTP request and parse path: S5-AC-08.
- Provider internal schema, unknown fields, text limits, plain text: S5-AC-09.
- Citation, domain token, number/date/percentage/unit validators:
  S5-AC-10.
- Rules-sourced answer validation: S5-AC-04, S5-AC-10.
- Cache key and no raw secret/question/prompt/context storage: S5-AC-12,
  S5-AC-19.
- Daily cap Asia/Shanghai day and atomic increment: S5-AC-13.

### Integration / API

- Only `/api/ai/ask`, required auth 401, cross-user planting 404: S5-AC-02.
- Typed valid and invalid request bodies: S5-AC-03.
- Public response shape and status priority: S5-AC-04.
- Exact `insufficient_data` with no provider call/cache write: S5-AC-05.
- Resolver selection and governed reads: S5-AC-06.
- Perennial selected IDs pass through `RecommendationDataService.build` opts:
  S5-AC-07.
- Provider off bypasses cache; cache hit; daily cap; provider failure; invalid
  output; valid output:
  S5-AC-08 through S5-AC-13.
- Production draft-only isolation: S5-AC-14.
- Prompt injection cannot alter resolver/id/user/governance: S5-AC-19.
- No lifecycle contract drift: S5-AC-20.

### Governance / Security

- Draft facts do not enter resolver context, prompt messages, provider request,
  cache, public answer, public citations, or warnings: S5-AC-14.
- Provider output with extra fields or `warnings` is rejected: S5-AC-09.
- AI prose is not written to agricultural tables or governance evidence:
  S5-AC-10.
- Raw question, raw prompt, JWT, provider key, cache key, and database URL are
  absent from logs/cache/artifacts: S5-AC-11, S5-AC-12, S5-AC-19.
- HTML/Markdown/URL output is rejected or rendered as plain text: S5-AC-09,
  S5-AC-19.

### H5 Component

- Shared bottom sheet on three pages: S5-AC-15.
- Core page renders before AI request: S5-AC-15.
- Loading, answered, disabled rules fallback, provider unavailable rules
  fallback, insufficient data, and 429 render:
  S5-AC-15.
- H5 sends typed identifiers only and renders plain text: S5-AC-03,
  S5-AC-19.

### Playwright

- Perennial plan explanation path: S5-AC-15.
- Seasonal item explanation path with provider failure rules display:
  S5-AC-15, S5-AC-18.
- Planting current-stage explanation path: S5-AC-15, S5-AC-20.
- Existing Slice 2 and Slice 3 browser paths remain green: S5-AC-18.

### Migration

- Fresh database to Slice 5: S5-AC-17.
- Slice2 frozen database to Slice 5: S5-AC-17.
- Database produced from all migrations in Slice 4 candidate
  `853852d1d1c118f2f6765b280c4f0ef3d3299a29` to Slice 5: S5-AC-17.
- Second deploy idempotence and preservation of User, UserIdentity,
  TerraceProfile, PlantingRecord, PlantingEvent, and UserMaterialInventory:
  S5-AC-17.

### Smoke / CI

- No real provider key is required: S5-AC-18.
- Health behavior unchanged: S5-AC-16.
- Production draft-only `/api/ai/ask` returns `insufficient_data`: S5-AC-14,
  S5-AC-18.
- Full tests, builds, Compose config, image builds, smoke, migration upgrade,
  AI gates, and Playwright pass: S5-AC-18.

## 18. Implementation Order

1. Add red tests for S5-AC-01 through S5-AC-05 and S5-AC-20.
2. Add Prisma migration and config for S5-AC-11, S5-AC-12, S5-AC-13, and
   S5-AC-17.
3. Add AI endpoint shell, AuthGuard use, DTO, and per-user limiter for
   S5-AC-02, S5-AC-03, and S5-AC-13.
4. Add fixed resolvers for S5-AC-06, S5-AC-07, S5-AC-14, and S5-AC-20.
5. Add citation builder and allowed-terms context for S5-AC-10.
6. Add rules-sourced answer generator for S5-AC-04, S5-AC-05, and S5-AC-10.
7. Add off/mock/openai-compatible providers for S5-AC-08 and S5-AC-11.
8. Add provider schema and lexical validators for S5-AC-09, S5-AC-10, and
   S5-AC-19.
9. Add cache and daily cap services for S5-AC-12 and S5-AC-13.
10. Add H5 shared bottom sheet for S5-AC-15 and S5-AC-19.
11. Add health-unaffected tests, production smoke, migration upgrade, CI, and
    docs for S5-AC-16 through S5-AC-18.
12. Run full regression and produce Slice 5 Delivery Report mapped to
    S5-AC-01 through S5-AC-20.

## 19. Delivery Evidence

The Slice 5 Delivery Report must include:

- Final candidate commit SHA: S5-AC-01.
- Exact baseline/current merge commit relationship: S5-AC-01.
- S5-AC to implementation to exact test name to asserted behavior matrix:
  S5-AC-01 through S5-AC-20.
- Provider contract snapshot date `2026-08-09` and fixture evidence:
  S5-AC-08, S5-AC-09.
- Lexical validator evidence and statement that it is not semantic entailment:
  S5-AC-10.
- Configuration matrix for `off`, `mock`, and `openai_compatible`: S5-AC-11.
- Cache schema and raw-data exclusion evidence: S5-AC-12, S5-AC-19.
- AI-specific rate-limit and daily-cap evidence: S5-AC-13.
- Production draft-only isolation evidence: S5-AC-14.
- H5 component and Playwright evidence for all three entry points:
  S5-AC-15, S5-AC-18.
- Proof existing health semantics are unchanged: S5-AC-16.
- Migration evidence for fresh, Slice2 frozen, Slice4 candidate, and second
  deploy: S5-AC-17.
- Full tests, builds, images, smoke, and no real provider key evidence:
  S5-AC-18.
- Prompt injection, privacy, and plain-text evidence: S5-AC-19.
- ActiveAction/lifecycle boundary evidence and any scope conflict:
  S5-AC-20.
- Any `NOT AUTOMATED` item with waiver. P0 AC items may not be waived.

## 20. Risk Register

| Risk | Guardrail |
| --- | --- |
| Broad AI scope returns | S5-AC-01 and S5-AC-20 stop rules |
| Draft facts leak | S5-AC-06 and S5-AC-14 governed resolver tests |
| Provider output invents facts | S5-AC-09 and S5-AC-10 local validators |
| Validator overclaims semantics | S5-AC-10 explicitly limits validator to structural and lexical checks |
| H5 serializes its rules UI label | S5-AC-15 keeps fallback labels in UI only |
| Provider outage breaks product | S5-AC-04, S5-AC-08, S5-AC-16 |
| Cost abuse | S5-AC-13 user-id endpoint limiter and daily cap |
| Cache serves wrong answer | S5-AC-12 cache key includes context hash, provider, model, prompt version |
| Prompt injection | S5-AC-19 and fixed server resolver selection |
| Lifecycle drift | S5-AC-20, `PlantingsService.now` only |

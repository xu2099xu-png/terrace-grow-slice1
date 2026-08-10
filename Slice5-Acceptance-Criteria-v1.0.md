# Slice 5 Acceptance Criteria v1.0 - Grounded AI Explanation

> Status: FROZEN / APPROVED FOR IMPLEMENTATION
> Baseline: Slice 4 frozen product candidate `853852d1d1c118f2f6765b280c4f0ef3d3299a29`
> Current main merge commit: `e65f05cd74abaacf44ac8ab4483ee558fb70acab`

The current main merge commit only contains the Slice 4 frozen product candidate
plus process/report history. It does not supersede the frozen product-code
baseline above.

## 1. Product Contract

Slice 5 builds one user-visible AI enhancement loop: grounded explanations for
existing product results.

Users may ask "why" or one short contextual question from:

- the perennial plan page,
- one seasonal recommendation item,
- the current planting stage page.

The AI explains existing rule-engine output in beginner-friendly language. It
must not calculate, rank, filter, select crops, select containers, compute soil,
infer lifecycle stage, approve content, or create agricultural facts. Core pages
and core APIs must render and complete before any AI request is made.

The original architecture grouped a broad Slice 5 package: provider integration,
Tool Calling, numeric trace validation, explanation, question answering,
multi-Agent content review, and AI cache. This v1.0 deliberately splits that
package. Slice 5 contains only user-facing grounded explanation. Multi-Agent
content review, ContentReviewLog workflows, expert-review back office, and
open-ended Q&A are future independent slices.

## 2. P0 Acceptance Criteria

### S5-AC-01 Scope and Frozen Baseline

Implementation must start from Slice 4 frozen product candidate
`853852d1d1c118f2f6765b280c4f0ef3d3299a29`.

Current main commit `e65f05cd74abaacf44ac8ab4483ee558fb70acab` is allowed as the
working branch head only because it contains that candidate plus process/report
history. It must not be treated as a new product baseline unless independently
declared.

Slice 5 must not implement:

- open-domain chat,
- multi-turn conversation memory,
- provider-side function/tool calling,
- multi-Agent content auditing,
- ContentReviewLog back office,
- generated or approved agricultural facts,
- RAG, embeddings, or vector databases,
- image diagnosis,
- push notifications,
- mini-program work,
- ecommerce,
- new crops, varieties, lifecycle templates, sowing calendars, or agricultural
  fact seed data.

### S5-AC-02 Single Endpoint and Auth

The only public AI endpoint is:

```text
POST /api/ai/ask
```

It must use the existing global `AuthGuard`. Missing, malformed, invalid, or
expired credentials return the existing 401 contract. Cross-user `planting_id`
for `planting_now` returns the existing non-enumerating 404 behavior.

### S5-AC-03 Discriminated Request Validation

The request body must use custom discriminated validation keyed by
`context_type`. Unknown fields return HTTP 400 using the frozen Slice 4
validation shape.

Every valid request contains:

```json
{
  "context_type": "perennial_plan | seasonal_item | planting_now",
  "question": "1-300 chars"
}
```

The endpoint must not accept:

- `context_id`,
- `client_request_id`,
- arbitrary tool arguments,
- agricultural facts,
- calculated facts,
- weather facts,
- soil ratios,
- dates to interpret,
- lifecycle actions,
- crop attributes,
- provider status fields.

#### `perennial_plan`

The exact allowed field set is:

```json
{
  "context_type": "perennial_plan",
  "question": "string",
  "crop_id": "string",
  "selected_container_type_id": "string | omitted",
  "selected_variety_id": "string | omitted"
}
```

Required: `context_type`, `question`, `crop_id`.

`selected_container_type_id` and `selected_variety_id` are optional strings. If
present they must be strings. `null` is rejected.

#### `seasonal_item`

The exact allowed field set is:

```json
{
  "context_type": "seasonal_item",
  "question": "string",
  "city_code": "string",
  "crop_id": "string"
}
```

Required: `context_type`, `question`, `city_code`, `crop_id`.

#### `planting_now`

The exact allowed field set is:

```json
{
  "context_type": "planting_now",
  "question": "string",
  "planting_id": "string"
}
```

Required: `context_type`, `question`, `planting_id`.

Invalid request bodies return:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Invalid request",
  "errors": []
}
```

### S5-AC-04 Public Response Shape and Status Priority

Every valid request returns HTTP 200 with exactly these top-level public fields:

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

The public response must not include `provider_status`, `context_hash`,
`tool_calls`, raw provider metadata, prompt text, raw question, user id, cache key,
or internal resolver payload.

Status priority is frozen:

1. Ownership failure for `planting_now` returns 404.
2. Validation failure returns the frozen Slice 4 400 shape.
3. Context unavailable or ungrounded returns `insufficient_data`.
4. `AI_PROVIDER=off` returns `disabled` with rules fallback.
5. Successful cache hit returns `answered` with `source="ai"`.
6. Daily provider cap exhausted returns `disabled` with rules fallback.
7. Provider failure, timeout, invalid JSON, output schema failure, citation
   failure, or trace failure returns `provider_unavailable` with rules fallback.
8. Successful validated provider output returns `answered` with `source="ai"`.

`AI_PROVIDER=off` is evaluated before cache lookup. Off mode must never return
cached AI output.

### S5-AC-05 Exact `insufficient_data` Contract

`insufficient_data` response is exactly:

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

The warning text may vary but must be generic and must not disclose agricultural
facts.

For `insufficient_data`:

- do not call the provider,
- do not read draft facts in production,
- do not build a provider prompt,
- do not write cache,
- do not use rules fallback that leaks facts.

Production draft-only agricultural content must return this status for affected
agricultural contexts. It must not fall back to draft-derived rules text.

### S5-AC-06 Server Internal Resolvers, No Provider Tool Calling

Slice 5 does not use provider-side function calling or tool calling.

The word "tool" in this Slice means an internal server context resolver selected
by validated `context_type`. The provider cannot choose tools, append tools,
invoke tools, or propose tool arguments.

This is an intentional split from the original large Tool Calling plan:
open-ended tool-using Q&A is a future independent slice.

Every valid request must first execute the matching resolver:

| `context_type` | Required resolver |
| --- | --- |
| `perennial_plan` | `resolvePerennialPlanContext` |
| `seasonal_item` | `resolveSeasonalItemContext` |
| `planting_now` | `resolvePlantingNowContext` |

Only a grounded context may proceed to cache lookup or provider call. Resolver
results determine ownership and data availability before any provider work.

Resolvers must reuse existing service and governance paths. Production resolvers
must not read draft agricultural facts.

### S5-AC-07 Perennial Resolver Selected-ID Semantics

`resolvePerennialPlanContext` must call the existing perennial recommendation
assembly and pass selected references through its options:

- `selected_container_type_id`,
- `selected_variety_id`.

These selected ids are references only. They must not carry facts and must not
bypass existing recommendation validation, governance, or ownership behavior.

### S5-AC-08 Provider Minimal Contract

Provider contract snapshot date: `2026-08-09`.

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
    { "role": "system", "content": "server-owned instructions" },
    { "role": "user", "content": "compact grounded context, citation list, question, and output instructions" }
  ],
  "temperature": 0,
  "stream": false,
  "response_format": { "type": "json_object" }
}
```

`messages` must be non-empty and must contain at least one `system` message and
one `user` message. The user message contains only server-produced compact
context, the server citation/fact list, the validated question, and output
instructions. It must not contain secrets, JWTs, provider keys, database URLs, raw
resolver payloads, or unbounded user records.

The adapter parses `choices[0].message.content` as a string, then parses that
string as JSON.

These conditions return `provider_unavailable` with rules fallback:

- missing `choices[0].message.content`,
- non-string content,
- empty content,
- invalid JSON,
- empty JSON object,
- HTTP failure,
- timeout,
- thrown adapter error.

Provider-specific JSON mode, beta strict output mode, or any remote behavior is
not a security boundary. Local validation is the security boundary.

### S5-AC-09 Provider Output Schema and Text Limits

The provider is asked to return exactly this internal JSON shape:

```json
{
  "sentences": [
    { "text": "string", "fact_ids": ["string"] }
  ]
}
```

Validation limits:

- `sentences`: 1-5 items.
- sentence `text`: 1-160 chars.
- each sentence has 1-5 `fact_ids`.
- every sentence has at least one existing `fact_id`.
- final public `answer`: 1-800 chars after backend joins sentences.
- public `citations`: 0-12 items.
- citation `fact_id`: 1-120 chars.
- citation `label`: 1-60 chars.
- citation `unit`: null or 1-20 chars.

Unknown provider output fields are rejected. Provider output must not contain
`warnings`, citations, status, source, cache fields, metadata, HTML, Markdown,
URLs, or tool-call-like data.

Provider text and public output must be plain text only:

- no HTML,
- no Markdown,
- no URLs,
- no images,
- no code blocks.

The backend builds public `answer` and `citations` from validated provider
sentences and resolver facts. The provider does not directly control public
citations. Public `warnings[]` are generated only by the server state machine or
server-owned resolvers; provider-generated warning text must never be copied into
the public response.

### S5-AC-10 Lexical Grounding, Citation, and Trace Validation

AI output must pass all checks before public `status="answered"`:

1. Valid provider JSON.
2. Exact internal provider schema.
3. Every `fact_id` exists in the resolver context.
4. Every sentence cites at least one fact.
5. Every public citation maps to an existing resolver fact.
6. Citation value exactly matches the resolver fact value.
7. Any crop, variety, material, lifecycle stage, action, start method, weather
   status, season status, suitability status, container type, soil material, or
   other domain entity/enum token appearing in a sentence must exist in that
   sentence's cited facts under server-owned `allowed_terms`.
8. Any number in a sentence must match that sentence's cited resolver facts.
9. Any date in a sentence must match that sentence's cited resolver facts.
10. Any percentage in a sentence must match that sentence's cited resolver facts.
11. Any unit-bearing quantity in a sentence must match that sentence's cited
    resolver facts.
12. No uncited agricultural recommendation, ratio, pH target, month/window,
    lifecycle action, weather fact, or container/soil quantity may appear.

The prompt must instruct the provider to only rewrite cited facts. The validator
is a structural and lexical boundary. It does not claim to prove natural-language
semantic entailment. AI prose is therefore never an agricultural fact, never
enters any engine, and never contributes to governance approval.

If any check fails, discard the provider output and return
`provider_unavailable` with rules fallback.

### S5-AC-11 Unified AI Configuration

AI configuration uses exactly these environment variables:

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

- `off` may omit all provider connection fields.
- `mock` is allowed only outside production.
- production rejects `mock`.
- `openai_compatible` validates base URL, API key, model, timeout, prompt
  version, cache TTL, daily cap, endpoint limit, and endpoint TTL.
- Do not use `AI_ENABLED` or any second naming scheme.
- Do not log provider key, raw prompt, raw question, JWT, or cache key.

### S5-AC-12 Cache Contract

Use PostgreSQL for AI explanation cache.

Cache only successful, fully validated `answered` outputs from AI. Do not cache:

- disabled fallback,
- provider failures,
- insufficient data,
- invalid JSON,
- schema failures,
- citation failures,
- numeric/date/percentage trace failures.

The logical cache key includes:

- `userId`,
- `contextType`,
- context reference fields,
- canonical context hash,
- normalized question hash,
- provider,
- model,
- prompt version.

Implementation should store one unique `cacheKeyHash`.

Cache rows must not store:

- raw question,
- raw prompt,
- raw resolver context,
- JWT,
- Authorization header,
- provider key,
- database URL.

Cached public responses must still use the exact public response shape.

### S5-AC-13 AI-Specific Rate Limit and Daily Cap

`POST /api/ai/ask` must have AI-specific per-user throttling that runs after
`AuthGuard` and keys only by `req.userId`.

It must not depend on:

- IP,
- `X-Forwarded-For`,
- device id,
- `client_request_id`.

It must not change Slice 4 global throttler semantics.

Endpoint throttle behavior:

- requests within the limit may proceed,
- requests over the limit return 429,
- the 429 response includes a valid `Retry-After` header.

Provider daily cap behavior:

- cap is checked before provider call,
- exhausted cap returns HTTP 200,
- response `status="disabled"`,
- `source="rules"`,
- `cache_hit=false`,
- no provider call.

Successful provider responses and cache hits always use `source="ai"`. Disabled,
insufficient-data, and provider-unavailable paths always use `source="rules"`.

### S5-AC-14 Production Draft-Only Isolation

Production draft-only agricultural content must not enter:

- resolver context,
- prompt messages,
- provider requests,
- cache keys,
- cache values,
- public response answers,
- public citations,
- warnings except generic non-fact warnings.

With the repository's current draft-only seed state, production requests for
affected agricultural contexts must return the exact `insufficient_data` contract
from S5-AC-05.

No migration or seed change may promote fixture data to `approved`.

### S5-AC-15 H5 Integration

Add real entry points to existing pages:

- `PerennialPlan.vue`: explain the current perennial plan.
- `SeasonalNow.vue`: explain one seasonal recommendation item.
- `PlantingDetail.vue`: explain current stage or current action.

All three use one shared bottom sheet component.

UI states:

- loading,
- answered,
- fallback,
- insufficient data.

The UI `fallback` state is a display state for responses where `source="rules"`
and public status is `disabled` or `provider_unavailable`. `fallback` is not a
public response `status` value.

The core page renders before any AI request starts. AI controls must not block
initial page data, navigation, planting actions, material updates, or seasonal
list rendering.

H5 displays plain text only. It must not render AI output as HTML or Markdown.

### S5-AC-16 Health Semantics

Slice 5 must not add AI readiness to any health decision.

Existing health endpoint semantics remain unchanged. AI provider downtime,
missing provider key while `AI_PROVIDER=off`, exhausted daily cap, or provider
timeout must not make application readiness fail.

No new AI readiness endpoint is required in this Slice.

### S5-AC-17 Migration Contract

If Slice 5 adds an AI cache table, migration verification must cover all paths:

- fresh database to Slice 5,
- existing Slice 2 frozen database to Slice 5,
- database produced by Slice 4 frozen product candidate
  `853852d1d1c118f2f6765b280c4f0ef3d3299a29` to Slice 5,
- second `prisma migrate deploy` is idempotent.

The upgrade paths must preserve:

- User,
- UserIdentity,
- TerraceProfile,
- PlantingRecord,
- PlantingEvent,
- UserMaterialInventory.

The AI cache table is not an agricultural fact table and must not use content
governance status as if cached prose were approved agricultural content.

### S5-AC-18 CI, Build, Images, Smoke, and Regression

Final delivery must run and pass:

- `npm run test:all`,
- root build,
- server build,
- H5 build,
- production Compose config validation,
- production image builds,
- production smoke test,
- migration upgrade tests,
- AI-specific gate tests,
- Playwright paths covering all three AI entry points and provider fallback.

No automated test may require a real provider key. Real provider integration, if
manually tested, must be reported separately and may not be required for CI
success.

### S5-AC-19 Prompt Injection, Privacy, and Plain Text

The user `question` is untrusted text. It must not be able to:

- change resolver selection,
- access a different crop/city/planting id,
- access another user,
- add provider tools,
- bypass validation,
- bypass governance,
- request raw context,
- request prompt text,
- request secrets,
- force HTML/Markdown/URL output.

Backend logs, cache rows, and delivery artifacts must not record raw question or
raw prompt. H5 and backend public output are plain text only.

### S5-AC-20 ActiveAction Boundary and Scope Conflict Rule

Architecture debt around `ActiveAction` and lifecycle contract is not part of
Slice 5. Slice 5 explains existing `planting_now` output only; it must not change
the lifecycle engine, `GET /api/plantings/:id/now` response contract, action
completion semantics, stage calculation, or current-stage ownership behavior.

Slice 5 must stop and record a scope conflict before implementation continues if
any required change would:

- alter perennial, seasonal, soil, sunlight, weather, lifecycle, governance,
  auth, validation, CORS, health, deployment, or production-readiness semantics
  from frozen Slice 1-4 behavior;
- change existing Slice 4 global rate-limit semantics.
- require new agricultural facts or approved content;
- require RAG/vector infrastructure;
- require ContentReviewLog or a background review UI;
- require AI in any core recommendation, planting, soil, weather, or seasonal
  request path;
- require weakening production draft filtering to make AI answers available.

Allowed exception: Slice 5 may add local protection for the new AI endpoint only,
as specified by S5-AC-13, without changing existing global limiter semantics.

The fix path for a true conflict is to freeze a separate architecture or baseline
correction first, then resume Slice 5 from the corrected frozen baseline.

## 3. Gate Matrix

| Gate | AC | Required machine assertions |
| --- | --- | --- |
| Baseline gate | S5-AC-01 | Delivery identifies Slice 4 candidate `853852d1d1c118f2f6765b280c4f0ef3d3299a29`; no broad Slice 5 scope is implemented |
| Endpoint/auth gate | S5-AC-02 | Only `POST /api/ai/ask`; required auth 401 cases; cross-user planting 404 |
| Request validation gate | S5-AC-03 | Three exact discriminated field sets; `context_id`, `client_request_id`, unknown fields, bad types, and overlength question return Slice 4 400 shape |
| Public response gate | S5-AC-04 | 200 responses expose only `status`, `answer`, `source`, `cache_hit`, `citations`, `warnings`; status priority asserts ownership/validation -> context -> off -> cache -> cap -> provider; off never returns cached AI |
| Insufficient data gate | S5-AC-05 | Exact empty-answer contract; no provider call; no cache write; generic non-fact warning only |
| Resolver gate | S5-AC-06 | Each context executes the matching internal resolver before cache/provider; provider cannot choose or pass tool args |
| Perennial selected-id gate | S5-AC-07 | Selected container/variety ids are passed to `RecommendationDataService.build` opts and remain references |
| Provider adapter gate | S5-AC-08 | Exact `/chat/completions` request contract; messages are non-empty with system+user; user message contains only compact grounded context/citations/question/instructions and no secrets; parses `choices[0].message.content`; missing/non-string/empty/invalid returns fallback |
| Provider output gate | S5-AC-09 | Internal `{sentences}` only; unknown fields and provider warnings rejected; fact id requirements, length/count bounds, plain text only |
| Trace gate | S5-AC-10 | Every sentence cites facts; domain/entity/enum tokens must exist in cited facts' allowed terms; uncited number/date/percentage/unit quantity fails validation and returns `provider_unavailable`; AI prose is never agricultural fact or governance evidence |
| Config gate | S5-AC-11 | `AI_PROVIDER=off` default; production rejects mock; openai-compatible validates all required vars; no `AI_ENABLED` |
| Cache gate | S5-AC-12 | Successful validated AI output caches by unique hash; raw question/prompt/context/JWT/key absent; failures not cached |
| Rate/cap gate | S5-AC-13 | AI-specific per-user throttle after AuthGuard returns 429 + Retry-After; daily cap returns 200 disabled and no provider call |
| Production draft gate | S5-AC-14 | Draft-only production facts do not enter resolver/prompt/cache/response; affected requests return exact insufficient_data |
| H5 gate | S5-AC-15 | Three existing pages expose shared bottom sheet; core page renders first; loading/answered/fallback/insufficient states visible |
| Health gate | S5-AC-16 | Existing health readiness unaffected by AI off, missing provider config in off mode, provider timeout, or cap exhaustion |
| Migration gate | S5-AC-17 | Fresh, Slice2 frozen, Slice4 candidate DB upgrades, second deploy idempotence, and user/terrace/planting/event preservation pass |
| Regression gate | S5-AC-18 | Full tests, builds, images, smoke, migrations, AI gates, and Playwright pass without real provider key |
| Prompt/privacy gate | S5-AC-19 | Prompt injection attempts cannot change resolver/id/user/governance; raw question/prompt not logged or cached; public output plain text |
| Boundary gate | S5-AC-20 | No lifecycle/ActiveAction contract change; no existing global rate-limit semantic change; scope conflict rule observed |

## 4. Delivery Evidence

The Slice 5 Delivery Report must include:

- final candidate commit SHA,
- exact baseline and current merge commit relationship,
- command list with exit codes,
- AC to implementation to exact test name to asserted behavior matrix,
- provider contract snapshot date `2026-08-09`,
- configuration matrix for `off`, `mock`, and `openai_compatible`,
- proof that AI readiness is not part of health readiness,
- proof that production draft-only content is not exposed to resolver, prompt,
  cache, or response,
- cache schema and migration evidence,
- AI-specific rate-limit and daily-cap evidence,
- production smoke result,
- Playwright evidence for the three H5 entry points,
- any `NOT AUTOMATED` item with waiver. P0 AC items may not be waived.

## 5. Definition of Done

Slice 5 is done only when:

1. S5-AC-01 is satisfied and this AC is explicitly frozen before product code
   changes begin.
2. S5-AC-02 through S5-AC-04 are implemented exactly as the public HTTP contract.
3. S5-AC-05 exact `insufficient_data` behavior is proven, including draft-only
   production.
4. S5-AC-06 and S5-AC-07 prove all grounding comes from internal resolvers and
   existing governed service paths.
5. S5-AC-08 through S5-AC-10 prove provider integration is locally validated,
   provider warnings are never public output, lexical grounding is enforced, and
   AI prose is never trusted as agricultural fact or governance evidence.
6. S5-AC-11 through S5-AC-13 prove configuration, cache, endpoint throttling, and
   daily cap behavior.
7. S5-AC-14 proves production draft content never reaches AI.
8. S5-AC-15 proves all three H5 entry points work with the shared bottom sheet,
   and UI fallback is displayed from `source="rules"` rather than a public
   `fallback` status.
9. S5-AC-16 proves health semantics are unchanged.
10. S5-AC-17 proves all required migration paths and data preservation.
11. S5-AC-18 proves full regression, builds, images, and smoke pass.
12. S5-AC-19 proves prompt injection and privacy controls.
13. S5-AC-20 proves no lifecycle contract drift and no existing global rate-limit
    semantic drift.
14. Independent review has no unresolved P0/P1 findings.

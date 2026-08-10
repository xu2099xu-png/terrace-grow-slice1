# Slice 6 Delivery Report - Region-First Seasonal Home

> Overall status: **CANDIDATE / PENDING EXTERNAL AUDIT**
> Contract snapshot: `Slice6-Acceptance-Criteria-v0.1.md` and
> `Slice6-Implementation-Plan-v0.1.md`
> Slice 5 frozen baseline product commit:
> `5b91de6af0194fdb437fb858834fd5d7c47833d4`
> Slice 6 freeze docs commit:
> `f00f08cb680e2c5e0238aae758aee11cc206e747`
> Slice 6 product candidate:
> `cd6c62279e9587f160417d8180c0880e564b0e13`
> PR: `#2`
> Hosted CI: **SUCCESS**, run `31366428260`, job `93385691606`, head SHA
> `cd6c62279e9587f160417d8180c0880e564b0e13`

This report records implementation and execution evidence for the exact Slice 6
product candidate above. It does not declare Slice 6 PASS/FROZEN; external audit
remains pending. It does not contain provider keys, JWTs, database URLs, raw
secrets, or raw user-private location coordinates.

## Final Superseding Candidate - Docs-Only Update

This section supersedes all earlier candidate references in the historical
sections below. The only current Slice 6 product candidate is:

**`cd6c62279e9587f160417d8180c0880e564b0e13`**

Hosted CI run `31366428260`, job `93385691606`, completed with **SUCCESS** for
this candidate. This is not a Claude PASS/FROZEN declaration; external Claude
audit remains a separate acceptance signal.

Final recorded gates for candidate
`cd6c62279e9587f160417d8180c0880e564b0e13`:

| Gate | Result |
| --- | --- |
| Full isolated test | PASS |
| Slice 5 AI gate | PASS |
| Slice 6 catalog check and Slice 6 gate | PASS |
| Migration upgrade | PASS |
| Production build | PASS |
| Production Compose config | PASS |
| Production image build | PASS |
| Production smoke | PASS |
| Exact hosted CI | PASS |

H5 IA closure recorded for this final candidate:

- Home removes the duplicate centered `PageHeader`; the complete canonical
  district becomes the top entry point.
- Home uses compact paired weather and today-calendar summaries.
- The recommendation first row is moved earlier in the first-screen IA.
- Responsive Home recommendations render as two columns at 320px and three
  columns at 375px, 390px, and 414px.
- Real visual checks recorded no horizontal overflow and no console errors for
  the checked widths.
- Unknown weather and season states fail neutral instead of implying a positive
  or negative condition.
- The frontend does not select sunlight facts from `environmentRequirement`;
  plant light facts remain server/catalog supplied.
- Server `available_start_methods` keep the frozen label mapping, and crop-wide
  catalog harvest display remains preserved.
- Unified long-term plant flow uses the canonical path sequence
  `/perennial` -> `/perennial/:plantId` -> `/perennial/:plantId/plan` ->
  `/planting-start`.
- Legacy `/plan/:cropId`, `/crops/:id`, and `/seasons/now` compatibility is
  retained only for frozen compatibility.
- Long-term plant listing consumes existing catalog API data, uses a reusable
  neutral `PlantCard`, and does not hardcode blueberry/grape entries.
- Unified `CropDetail.vue` remains the single detail container and composes
  shared plant sections. Missing knowledge fields are hidden.
- `PerennialPlan.vue` continues to use existing recommendation/soil endpoints
  without adding unsupported location fields. Route query location is used only
  for navigation continuity; displayed recommendation context comes from the
  authenticated TerraceProfile returned by `/terraces/mine`.
- Direct plan access without a TerraceProfile now shows an actionable create
  profile recovery state and links to `/terrace` with `target_crop_id`,
  `variety_id`, `admin_code`, and existing canonical `city_code`, allowing
  return to the canonical plan path.
- Plant card/detail image regions use server `coverImage` when present and a
  stable neutral placeholder when absent.
- H5 component/unit result: 20 files / 78 tests passed.
- Isolated Playwright result: 16 / 16 tests passed.
- Screenshot/overflow QA passed at 320px, 375px, 390px, 414px, and 480px.
  The 375px check recorded `clientWidth=375`, `scrollWidth=375`, `cards=3`,
  and `console errors=[]`.
- LAN URL used only for development validation:
  `http://192.168.3.150:5176/`.

Final scope-stop for this report:

- No Server, Prisma, or agriculture fact changes are included in this docs-only
  report update.
- No QWeather display expansion beyond the frozen Slice 6 display/weather
  contracts is introduced here.
- Legacy `/seasons/now` remains for frozen compatibility.
- Long-term A/B experimentation, catalog expansion, ecommerce flows, and soil
  engine/recommendation refactors were not brought into Slice 6.

## 0. External Audit State

- Independent implementation and gate review result before external audit:
  Blocking = 0.
- Hosted CI run `31366428260`, job `93385691606`, completed successfully for
  product candidate `cd6c62279e9587f160417d8180c0880e564b0e13`.
- Hosted CI covered full isolated tests, Slice 5 AI gate, Slice 6 catalog check,
  Slice 6 gate, migration upgrade, production build, Compose config, production
  images, and isolated production container smoke.
- External Claude audit remains the remaining acceptance signal.

## 1. Superseded Candidate History

- Candidate `a7fd63f042a86e093685ce0aa7df1673bf8d3372` was superseded.
- Candidate `15f178a743afdff723aa13f51b6f836644ae4695` was superseded by
  candidate `4f0e6429eb252364873508f8aab27664e1e003f5`.
- Candidate `4f0e6429eb252364873508f8aab27664e1e003f5` was superseded by
  latest candidate `cd6c62279e9587f160417d8180c0880e564b0e13`.
- Hosted CI run `31354129570` failed in isolated production container smoke at
  QWeather fixture API cache equality.
- Root cause: the smoke-only QWeather cache seed used fixed
  `DEFAULT_NOW=2026-08-09T04:00:00.000Z` with TTL `86400`; Hosted CI reached the
  cache read after `2026-08-10T04:03Z`, so the seeded row was expired.
- Candidate `15f178a743afdff723aa13f51b6f836644ae4695` separates deterministic
  fixture parse time from runtime cache write/read time and adds expiry/cache-hit
  assertions.

## 2. Scope Integrity

- Slice 6 starts from the exact Slice 5 frozen baseline
  `5b91de6af0194fdb437fb858834fd5d7c47833d4`.
- Scope is limited to nationwide district selection, region-to-climate mapping,
  server-owned today context, district display weather, three-tab IA, migration,
  CI gates, E2E, and production startup/smoke.
- No new crop, variety, soil, lifecycle, sowing-window, AI, auth, CORS, or health
  product semantics were intentionally added.
- Legacy `city_code` flows remain compatible while new public contracts use
  stable 6-digit `admin_code`.
- No gate calls a real weather provider. Production QWeather smoke uses frozen
  fixtures and a seeded cache with a fake dedicated HTTPS base/key.

## 3. Delivered Architecture

- Server owns the frozen mainland region catalog, import/check pipeline, public
  region directory APIs, location resolution, region-to-climate matching, today
  calendar context, district weather display, and `/api/seasonal/home`.
- Agricultural seasonal recommendation matching can use a climate proxy, but
  display weather cache identity and lookup remain selected-district based.
- Docker startup runs migration deploy, catalog check/import, then server start.
- H5 starts on `时令种植`, resolves or manually selects a district, persists only
  selected region display metadata, and keeps legacy deep links working.
- The same district picker is used by SeasonalHome and TerraceWizard.

## 4. Automated Results

Hosted CI run `31366428260`, job `93385691606`, is the authoritative remote
execution record for candidate `cd6c62279e9587f160417d8180c0880e564b0e13`.

| Gate | Evidence state |
| --- | --- |
| Hosted CI run `31366428260`, job `93385691606` | Success for head SHA `cd6c62279e9587f160417d8180c0880e564b0e13` |
| Server unit | Local exit 0, 20 files / 175 tests after final cache-expiry test |
| Server integration | Local exit 0, 9 files / 135 tests |
| H5 unit | Local exit 0, 20 files / 78 tests |
| Browser E2E | Isolated Playwright 16 / 16 tests; hosted full isolated gate also success |
| Slice 5 AI gate | Local/hosted success |
| Slice 6 catalog check | Hosted success; local catalog check success |
| Slice 6 gate | Local exit 0, 13 files / 110 tests after final cache-expiry test; hosted success |
| Migration upgrade | Local and hosted success: fresh DB, Slice 2 DB, Slice 4 DB, exact Slice 5 baseline DB, second deploy idempotence |
| Production build | Local and hosted success |
| Production Compose config/images | Local and hosted success |
| Production smoke | Local and hosted success with `APP_ENV=production` |
| Exact hosted CI | Run `31366428260`, job `93385691606`, success |

Final-candidate command evidence with exit 0, combining local focused reruns and
the hosted exact-candidate full gate:

```text
npm --prefix server run test:unit
npm --prefix server run test:integration
npm --prefix h5 run test
npm run test:all
npm run test:slice5-gate
npm run test:slice6-gate
npm run test:migration-upgrade
npm run build
npm --prefix server run build
H5_PORT=18084 SMOKE_PROJECT_NAME=terrace_s6_cache_now npm run test:production-smoke
```

Seed proof after the CI fix:

```text
fixture_now=2026-08-09T04:00:00.000Z
cache_now=2026-08-10T04:11:56.086Z
expires_at=2026-08-11T04:11:56.086Z
expires_at_is_future=true
cache_hit=true
```

## 5. Manifest and Fixture Evidence

Region catalog manifest evidence:

| Artifact | Evidence |
| --- | --- |
| data_version | `mca-xzqh-mainland-2026-08-09` |
| enabled rows | 3211 total: 31 provinces, 333 cities, 2847 districts |
| raw source SHA-256 | `a880ff2c2fc76f7e15c42dcef9476bd353fd48a2ce3ea397140358211636700e` |
| normalized hierarchy SHA-256 | `1e72730c812e5306081dda3745086d6cfef58333332aad2faf0f8bd97b8960f0` |
| representative canonical source SHA-256 | `0a89d533b11a9ade4a4aa331221e4f168ed00eafbd841ba285dd2eaa62a347ef` |
| representative exceptions SHA-256 | `d200726c2d38c32d9d0a94b6d54f225852e9dc47fcebaad440fe790dc6e1bdda` |
| final representative points SHA-256 | `243a6c3106106293f6a1e3e4427dcfcb87408e1f2f6cc5e4fc50cae67376763b` |

Product catalog file hashes:

| File | SHA-256 |
| --- | --- |
| `manifest.json` | `8f153eaf544f8a01d892b2de962425f5bd11d8888a5de24c3d7b7dec4a5abe8f` |
| `regions.json` | `a6d85f71b9f3560dadb2ed3bcb8378660f93947baecb279cf88bfa163da0c5fc` |
| `popular-cities.json` | `166bd104a2f7b5d32130538d337ee3c15836f07e6aad59223a8fb666b4c222c6` |
| `climate-direct-mappings.json` | `00b6447f51af3ef1e47e6bbeead100d201b4f126cda8e6a23a439ab242dcb5e0` |
| `climate-anchors.json` | `deec3df29bfacbb85ed2158befce57731d29fcd9183b19b01af16c04a23f2e0e` |

QWeather fixture hashes:

| Fixture | SHA-256 |
| --- | --- |
| `qweather-current-v1-display.fixture.json` | `b33eb93a7e52ebdfdca0a55d10fe6d8b7b7b2b93c89a05c65b904c3d5ebab3bd` |
| `qweather-daily-v1-agri-display.fixture.json` | `6d513171fa80d53565317cb4e4ac52077b5b7b4c5447c38d764bfe1d96ca915d` |
| `qweather-weatheralert-v1-display.fixture.json` | `ad76821d0dcc423e84e530ac7c3dd3c865d685ba093db165cb386dbd68c15b2c` |
| `qweather-weatheralert-v1-refer-compat.fixture.json` | `353199da0154ab87096587fbd64dea6486b2ccced59552d3a27edf181e48a2f6` |

QWeather provider-contract manifest entries:

| Interface | Endpoint path | Official documentation URL | Snapshot/auth/host | Exact consumed JSON paths | Attribution paths | Fixture / checksum | Parser |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Display current weather | `GET /weather/v1/current/{latitude}/{longitude}` | `https://dev.qweather.com/en/docs/api/weather/weather-current/` | snapshot `2026-08-10`; account-specific dedicated API Host; server-side `X-QW-Api-Key`; no query-string key | `metadata.tag`, `condition.text`, `condition.code`, `temperature.value`, `temperature.unit`, `humidity`, `wind.direction.compass`, `wind.direction.degree`, `wind.speed.value`, `wind.speed.unit`, `wind.scale`, `precipitation.amount.value`, `precipitation.amount.unit`, `precipitation.intensity.value`, `precipitation.intensity.unit`, `precipitation.type` | `metadata.attributions[]` | `qweather-current-v1-display.fixture.json` / `b33eb93a7e52ebdfdca0a55d10fe6d8b7b7b2b93c89a05c65b904c3d5ebab3bd` | `qweather-current-v1-display-parser@1` |
| Agricultural/display daily forecast | `GET /weather/v1/daily/{latitude}/{longitude}` with `days=3` | `https://dev.qweather.com/en/docs/api/weather/weather-daily-forecast/` | snapshot `2026-08-10`; account-specific dedicated API Host; server-side `X-QW-Api-Key`; no query-string key | `metadata.tag`, `days[].forecastStartTime`, `days[].forecastEndTime`, `days[].temperatureMin.value`, `days[].temperatureMin.unit`, `days[].temperatureMax.value`, `days[].temperatureMax.unit`, `days[0].daytime.condition.text`, `days[0].daytime.condition.code`, `days[0].daytime.precipitation.amount.value`, `days[0].daytime.precipitation.amount.unit`, `days[0].daytime.precipitation.probability`, `days[0].daytime.precipitation.type`, `days[0].daytime.humidity`, `days[0].daytime.wind.direction.compass`, `days[0].daytime.wind.speed.value`, `days[0].daytime.wind.speed.unit`, `days[0].daytime.wind.scale` | `metadata.attributions[]`; frost remains internal `unknown` because QWeather daily v1 provides no explicit frost fact consumed by Slice 6 | `qweather-daily-v1-agri-display.fixture.json` / `6d513171fa80d53565317cb4e4ac52077b5b7b4c5447c38d764bfe1d96ca915d` | `qweather-daily-v1-agri-display-parser@1` |
| Display weather warning - normal v1 schema | `GET /weatheralert/v1/current/{latitude}/{longitude}` | `https://dev.qweather.com/en/docs/api/warning/weather-alert/` | snapshot `2026-08-10`; account-specific dedicated API Host; server-side `X-QW-Api-Key`; no query-string key | `metadata.tag`, `metadata.zeroResult`, `alerts[].id`, `alerts[].senderName`, `alerts[].issuedTime`, `alerts[].eventType.name`, `alerts[].eventType.code`, `alerts[].severity`, `alerts[].certainty`, `alerts[].color.code`, `alerts[].effectiveTime`, `alerts[].onsetTime`, `alerts[].expireTime`, `alerts[].headline`, `alerts[].description` | documented normal paths: `metadata.attributions[]`, `alerts[].senderName`; `refer` may be absent and must not be invented | `qweather-weatheralert-v1-display.fixture.json` / `ad76821d0dcc423e84e530ac7c3dd3c865d685ba093db165cb386dbd68c15b2c` | `qweather-weatheralert-v1-display-parser@2` |
| Display weather warning - optional terms compatibility | `GET /weatheralert/v1/current/{latitude}/{longitude}` | `https://dev.qweather.com/en/docs/api/warning/weather-alert/`; `https://dev.qweather.com/en/docs/terms/attribution/`; `https://dev.qweather.com/docs/terms/attribution/` | snapshot `2026-08-10`; account-specific dedicated API Host; server-side `X-QW-Api-Key`; no query-string key | same normal v1 weather-warning paths as above; optional compatibility validation of `refer.sources` only when present | normal paths plus optional terms-compat path `refer.sources[]`; not a Weather Alert v1 schema-required path | `qweather-weatheralert-v1-refer-compat.fixture.json` / `353199da0154ab87096587fbd64dea6486b2ccced59552d3a27edf181e48a2f6` | `qweather-weatheralert-v1-display-parser@2` |

Weather-warning official documentation conflict manifest:

- type: `official_documentation_conflict`
- interface: `qweather-weatheralert-v1-current`
- snapshot_date: `2026-08-10`
- schema_url: `https://dev.qweather.com/en/docs/api/warning/weather-alert/`
- attribution_terms_urls:
  `https://dev.qweather.com/en/docs/terms/attribution/`,
  `https://dev.qweather.com/docs/terms/attribution/`
- schema_observation: Weather Alert v1 response/schema documents
  `metadata.attributions[]` and `alerts[].senderName` for attribution/source
  display and does not list `refer`.
- terms_observation: QWeather Attribution Terms for Weather Warning require
  displaying all `refer.sources` content without modification.
- resolution_rule: Treat `metadata.attributions[]` and `alerts[].senderName` as
  documented normal Weather Alert v1 paths. Accept normal responses with missing
  `refer`. If an actual response includes `refer.sources`, validate it as
  `string[]` and pass it through exactly after `metadata.attributions[]` and
  `alerts[].senderName`. If `refer.sources` is present but malformed, fail
  closed for warning display and do not cache that warning/attribution. Never
  invent `refer.sources`.

QWeather compatibility evidence:

- Current/daily/warning v1 paths use `{latitude}/{longitude}`,
  `X-QW-Api-Key`, `localTime=true`, and `lang=zh`.
- Normal warning fixture without `refer` succeeds and does not invent sources.
- Compatibility warning fixture preserves ordered
  `metadata.attributions[]`, `alerts[].senderName`, then `refer.sources[]`.
- Malformed present `refer.sources` fails closed for warning display and forbids
  caching that warning attribution.
- Public/H5 attribution uses exact name `和风天气/QWeather` and exact href
  `https://www.qweather.com`.
- Cache equality is asserted by repeated API calls returning identical public
  weather from the seeded selected-district cache.

## 6. Production Smoke Evidence

Production smoke proves:

- `APP_ENV=production` startup works with `WEATHER_PROVIDER=off`.
- Health remains compatible and does not depend on real provider readiness.
- Migration deploy, catalog check/import, and start are ordered in the production
  startup path.
- H5 production build is used through ingress, not a dev server.
- Anonymous fresh context clears storage and denies geolocation, then reaches the
  manual district picker and selects an ordinary district.
- QWeather fixture path seeds only selected district `330106` 西湖区 for bucket
  `2026-08-10`; climate proxy `330102` 上城区 has no seeded weather cache.
- API asserts `selected_area_code=330106`, `climate_area_code=330102`,
  `status=nearest_proxy`, `proxy_used=true`, `distance_km=7.4`,
  `weather.status=available`, and `weather.cache_hit=true`.
- H5 visible state asserts 西湖区 localStorage metadata, QWeather link exact
  accessible name/href, warning visibility, ordered sources, and cache marker.

## 7. AC Traceability

| AC | Implementation | Exact test/assertion | Result |
| --- | --- | --- | --- |
| S6-AC-01 | Baseline guard and scope-limited Slice 6 files | Report records Slice 5 baseline `5b91de6af0194fdb437fb858834fd5d7c47833d4`, freeze docs `f00f08cb680e2c5e0238aae758aee11cc206e747`, product SHA `cd6c62279e9587f160417d8180c0880e564b0e13`; no cross-slice fact expansion | Covered; pending external audit |
| S6-AC-02 | Region schema, catalog data, import/check scripts, Docker packaging | `catalog:check`, Slice6 gate catalog invariants, hosted catalog check; hashes and counts above | Covered; pending external audit |
| S6-AC-03 | `/api/location/regions`, `/api/location/popular-cities` | Slice6 HTTP tests assert exact public shape, municipality no fake city, no internal legacy/data/source leak | Covered; pending external audit |
| S6-AC-04 | Location resolver and mock/off/provider failure behavior | Resolver specs and Slice6 HTTP tests assert district resolution, null failure path, no raw provider payload or precise coordinates | Covered; pending external audit |
| S6-AC-05 | SeasonalHome first-use location flow | H5 unit and Playwright assert denied, insecure/no geolocation, timeout, resolve-null all fall to manual picker | Covered; pending external audit |
| S6-AC-06 | Shared manual RegionPicker | Unit and browser tests assert ordinary city path and municipality district path using API machine fields | Covered; pending external audit |
| S6-AC-07 | Region-to-climate direct/proxy matching | Service and HTTP tests assert direct, nearest_proxy, unsupported, invalid; catalog gate proves no enabled district is unmapped | Covered; pending external audit |
| S6-AC-08 | `/api/seasonal/home` aggregate | Slice6 HTTP tests assert exact top-level keys, selected region, today, seasonal items, weather, legacy compatibility | Covered; pending external audit |
| S6-AC-09 | Today context service/cache | Calendar golden vectors, Asia/Shanghai boundary tests, cache identity tests, `SEASON_DATE` override | Covered; pending external audit |
| S6-AC-10 | District display weather provider/parser/cache | QWeather parser/provider/cache tests and production smoke assert v1 paths, attribution, warning sources, no proxy weather fallback | Covered; pending external audit |
| S6-AC-11 | Weather and calendar caches | Cache tests assert selected-area identity, expiry, corrupt/stale misses, cache equality, and no provider failures cached | Covered; pending external audit |
| S6-AC-12 | Three-tab H5 IA | H5 App test and Playwright assert tabs `时令种植`, `长期种植`, `我的`, default seasonal, legacy deep links | Covered; pending external audit |
| S6-AC-13 | Home first screen seasonal entry | SeasonalHome H5/browser tests assert first screen region/today/weather/seasonal behavior | Covered; pending external audit |
| S6-AC-14 | TerraceWizard district selection | H5 and Playwright assert active district selection auto-advances; prefilled district does not auto-advance | Covered; pending external audit |
| S6-AC-15 | Privacy contract | H5 storage tests and Slice6 HTTP tests assert no precise coordinates/raw provider payload in public or local persisted metadata | Covered; pending external audit |
| S6-AC-16 | Failure/degradation matrix | Unit/browser/smoke assert provider off, geolocation denied/insecure/timeout/null, unsupported district, malformed warning refer | Covered; pending external audit |
| S6-AC-17 | Runtime configuration | Runtime config tests assert production constraints, off/http/mock behavior, dedicated QWeather host compatibility | Covered; pending external audit |
| S6-AC-18 | Migration contract | Migration upgrade gate covers fresh/S2/S4/exact S5 baseline/second deploy and catalog import idempotence | Covered; pending external audit |
| S6-AC-19 | Automated test gate | Hosted CI steps include full isolated test, Slice5 AI gate, Slice6 catalog check, Slice6 gate, migration, build, production smoke | Covered; pending external audit |
| S6-AC-20 | Production smoke and delivery evidence | This report plus production smoke evidence above; run `31366428260`, job `93385691606`, success for exact product candidate `cd6c62279e9587f160417d8180c0880e564b0e13` | Covered; pending external audit |

## 8. H5 and Visual QA

- Browser E2E covered first-use denied location, manual ordinary district
  selection, municipality selection, three-tab IA, legacy deep link, and
  TerraceWizard auto-next.
- H5 unit coverage includes browser location success, denied, insecure context,
  timeout, resolve-null, ordered attribution source display, and exact warning
  order; final H5 IA closure totals 20 files / 78 tests.
- Home IA closure removes the duplicate centered `PageHeader`, promotes the
  complete canonical district as the top entry point, uses compact paired
  weather/today-calendar summaries, and moves the recommendation first row
  earlier.
- Visual QA was performed at 320px, 375px, 390px, 414px, and 480px for the
  final H5 IA closure surfaces; the 375px check recorded `clientWidth=375`,
  `scrollWidth=375`, `cards=3`, and `console errors=[]`. No blocking overlap,
  inaccessible tab flow, unreadable attribution, horizontal overflow, or console
  errors was recorded. Home recommendation cards render as two columns at 320px
  and three columns at 375px, 390px, and 414px.
- Unknown weather and season states fail neutral; the frontend does not select
  sunlight facts from `environmentRequirement`. Frozen
  `available_start_methods` labels and crop-wide catalog harvest display remain
  preserved.

## 9. Known Nonblocking Warnings

- Vitest/Vite emits a native config-loader deprecation warning for ESM syntax in
  `vitest.config.ts`.
- QWeather malformed `refer.sources` tests intentionally log a provider warning.
- Prisma CLI emits an update-available notice during smoke.
- Hosted CI emits the GitHub Actions Node.js 20 deprecation annotation for
  `actions/checkout@v4` and `actions/setup-node@v4` being forced to Node 24.

## 10. External Review Target

Review code and behavior at exactly:

**`cd6c62279e9587f160417d8180c0880e564b0e13`**

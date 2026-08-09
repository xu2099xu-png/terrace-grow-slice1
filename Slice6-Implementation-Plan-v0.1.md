# Slice 6 Implementation Plan v0.1 - Region-First Seasonal Home

> Status: DRAFT / NOT APPROVED FOR IMPLEMENTATION.
> Aligned draft: `Slice6-Acceptance-Criteria-v0.1.md`.
> Baseline: Slice 5 final frozen product candidate `TBD`.

This plan is a drafting artifact only. Product-code implementation must not begin
while the Slice 5 baseline remains `TBD` or while the Slice 6 AC is not frozen.
If this plan conflicts with the AC, the AC wins and this plan must be revised
before implementation starts.

## 1. Scope Boundary

Slice 6 adds a region-first seasonal entry, district weather display, server-owned
today context, and three-tab H5 IA. It must not change crop, variety, container,
soil, lifecycle, sowing-calendar, AI, auth, CORS, health, or existing seasonal
engine semantics.

Allowed new agricultural mapping facts are limited to:

- region-to-climate direct mappings,
- climate proxy anchors,
- the deterministic nearest-proxy algorithm.

No new agricultural crop facts, seasonal crops, sowing windows, perennial content,
soil recipes, variety facts, lifecycle templates, or fixture promotion are planned.

## 2. Architecture Decision

Use a new governed region subsystem around stable `admin_code` values, while
keeping legacy `cityCode` flows compatible.

Server responsibilities:

- Own the nationwide region catalog and region-to-climate mapping.
- Resolve provider location output to internal enabled district `admin_code`.
- Produce one `/api/seasonal/home` aggregate payload containing region, today,
  display weather, and seasonal recommendations.
- Reuse existing Seasons internals and the frozen seasonal engine; do not fork
  eligibility, ranking, date-window, or weather hard-filter logic.
- Keep display weather and existing agricultural `DailyWeather` facts separated.

H5 responsibilities:

- Make `时令种植` the default top-level tab.
- Resolve/select a district before loading the seasonal home payload.
- Persist only selected region display metadata locally.
- Keep old routes and deep links working.
- Reuse the same region picker in SeasonalHome and TerraceWizard.

## 3. Planned File / Module Surface

Expected server modules:

- `server/prisma/schema.prisma`
- `server/prisma/migrations/<slice6>/migration.sql`
- `server/data/regions/<version>/manifest.json`
- `server/data/regions/<version>/regions.json`
- `server/data/regions/<version>/popular-cities.json`
- `server/data/regions/<version>/climate-direct-mappings.json`
- `server/data/regions/<version>/climate-anchors.json`
- `server/scripts/import-region-catalog.ts`
- `server/scripts/check-region-catalog.ts`
- `server/src/config/runtime-config.ts`
- `server/src/location/*`
- `server/src/regions/*`
- `server/src/weather/*`
- `server/src/calendar/*`
- `server/src/seasonal-home/*`
- `server/src/seasons/seasons.service.ts`
- `server/src/terraces/*`
- `server/src/agri-data.service.ts`
- `server/src/app.module.ts`

Expected H5 modules:

- `h5/src/App.vue`
- `h5/src/router/index.ts`
- `h5/src/views/SeasonalHome.vue`
- `h5/src/views/SeasonalNow.vue`
- `h5/src/views/Home.vue`
- `h5/src/views/TerraceWizard.vue`
- `h5/src/components/RegionPicker.vue`
- `h5/src/api/region-selection.ts`
- existing H5 specs plus new focused specs.

Expected E2E / CI / smoke modules:

- `e2e/seasonal.spec.ts`
- new `e2e/region-seasonal-home.spec.ts`
- new `e2e/three-tab-ia.spec.ts`
- new `e2e/terrace-region-wizard.spec.ts`
- `scripts/browser-e2e-server.sh`
- `scripts/production-smoke.sh`
- `server/scripts/migration-upgrade-test.js`
- `.github/workflows/ci.yml`

## 4. Data Model Plan

### 4.1 Region

Add a Prisma `Region` model keyed by `adminCode`.

Planned fields:

- `adminCode String @id`
- `name String`
- `level String` with allowed values `province | city | district`
- `parentAdminCode String?`
- `enabled Boolean`
- `catalogOrder Int`
- `dataVersion String`
- `source String`
- `centroidLng Float`
- `centroidLat Float`
- `createdAt DateTime`
- `updatedAt DateTime`

Indexes:

- `@@index([level, parentAdminCode, enabled, catalogOrder])`
- `@@index([enabled, level])`

Validation gate, not ad hoc application logic, must reject duplicate rows,
unknown parents, disabled parent chains, cycles, invalid centroids, and non-stable
ordering.

### 4.2 Region-to-Climate Mapping

Use two explicit governed tables rather than overloading `ClimateZone.cityCodes`.

`RegionClimateMapping`:

- direct mapping only,
- `adminCode` unique,
- `climateZoneCode`,
- `source`,
- `reviewStatus`,
- `confidence`,
- `version`.

`ClimateAnchor`:

- nearest-proxy candidate rows,
- `adminCode` unique,
- `climateZoneCode`,
- anchor centroid copied from `Region` at import/check time or resolved by join,
- `enabled`,
- `source`,
- `reviewStatus`,
- `confidence`,
- `version`.

Resolution order:

1. Syntactically invalid `admin_code` -> frozen HTTP 400 validation shape.
2. Well-formed unknown or disabled `admin_code` -> HTTP 200 with `region=null`,
   `agri_region_match.status="unsupported"`, weather unavailable, and
   `seasonal.items=[]`.
3. Enabled district with approved direct mapping -> `direct`.
4. Enabled district without direct mapping -> nearest approved enabled
   `ClimateAnchor` by Haversine distance.

`unsupported` is not a normal state for enabled districts. The catalog check gate
must fail if any enabled district cannot resolve direct or nearest_proxy.

### 4.3 Weather Cache

Add `WeatherCache` for parsed public/internal weather facts only.

Planned unique key:

- `adminCode`
- `provider`
- `providerEndpointVersion`
- `bucket`
- `parserVersion`

Planned fields:

- `cacheKeyHash String @unique`
- `adminCode String`
- `provider String`
- `providerEndpointVersion String`
- `parserVersion String`
- `bucket String`
- `publicWeather Json`
- `dailyWeather Json`
- `attribution Json`
- `status String`
- `observedAt DateTime?`
- `updatedAt DateTime`
- `expiresAt DateTime`

Do not store provider keys, raw provider payloads, user IDs, JWTs,
Authorization headers, or precise user coordinates. Catalog centroids may be used
for lookup but should not be duplicated beyond the parsed cache fields unless the
AC explicitly allows it. `attribution` is stored only after validation and must
preserve the exact public attribution data used by H5, including QWeather
`refer.sources` and weather-warning source names.

### 4.4 Calendar Cache

Add `CalendarContextCache` or an equivalent table keyed by:

- `date`
- `timezone`
- `algorithmVersion`

It stores the exact public today-context JSON after validation. Runtime calendar
calculation must use a pinned local library or repository-owned local table and
must not call external network services.

Before implementation, the frozen AC or manifest must name:

- calendar algorithm/table version,
- source/provenance,
- checksum if table-backed,
- golden fixture dates.

### 4.5 TerraceProfile Legacy Migration

Do not remove or reinterpret `cityCode` in Slice 6.

Add:

- `regionAdminCode String?`
- `needsDistrictConfirmation Boolean @default(false)`

Migration/backfill rule:

- For the 17 legacy city codes, set `regionAdminCode` to the city-level canonical
  `admin_code`, not a guessed district.
- Set `needsDistrictConfirmation=true`.
- Preserve `cityCode` so existing Slice 1-5 flows keep working.
- New confirmed district submissions set `regionAdminCode` to a district code and
  `needsDistrictConfirmation=false`.

The backfill must be deterministic and verified by upgrade tests for all 17 legacy
values listed in S6-AC-18.

## 5. Dataset Manifest and Import Gate

Use repository-controlled structured data plus a manifest. Do not use raw SQL
string hacks to construct or parse catalog data.

Planned manifest fields:

```json
{
  "dataset_name": "string",
  "source": "official-or-owner-approved source",
  "source_url": "string | null",
  "source_version": "string",
  "import_date": "YYYY-MM-DD",
  "data_version": "string",
  "region_row_count": 0,
  "popular_city_count": 0,
  "direct_mapping_count": 0,
  "climate_anchor_count": 0,
  "regions_sha256": "hex",
  "popular_cities_sha256": "hex",
  "direct_mappings_sha256": "hex",
  "climate_anchors_sha256": "hex"
}
```

Import approach:

- Prisma migration creates tables and nullable profile fields.
- `server/scripts/check-region-catalog.ts` validates structured JSON and checksum.
- `server/scripts/import-region-catalog.ts` uses Prisma Client transactions and
  typed parsing to upsert catalog, popular-city flags, direct mappings, anchors,
  and legacy city mapping metadata.
- Production image includes the manifest and catalog files.
- Server entrypoint or deployment command runs import after `prisma migrate deploy`
  and before starting the app.
- CI and smoke run the same import/check path.

The import is idempotent. A checksum mismatch, invalid hierarchy, unknown climate
zone, disabled anchor, missing legacy city mapping, or unresolved enabled district
is a gate failure.

## 6. Provider and Runtime Config Plan

### 6.1 Config

Extend centralized runtime config with:

- `REGION_CATALOG_VERSION`
- `LOCATION_PROVIDER=off|http|mock`
- `LOCATION_PROVIDER_BASE_URL` or host
- `LOCATION_PROVIDER_API_KEY`
- `LOCATION_PROVIDER_TIMEOUT_MS`
- `WEATHER_PROVIDER=off|http|mock`
- `WEATHER_PROVIDER_BASE_URL` or host
- `WEATHER_PROVIDER_API_KEY`
- `WEATHER_PROVIDER_TIMEOUT_MS`
- `WEATHER_CACHE_TTL_SECONDS`
- `WEATHER_ENDPOINT_VERSION`
- `WEATHER_PARSER_VERSION`
- `CALENDAR_ALGORITHM_VERSION`

Existing `LOCATION_RESOLVER` should either be migrated to `LOCATION_PROVIDER` or
accepted as a temporary development alias with tests proving the public config
contract uses `LOCATION_PROVIDER`.

Production rules:

- `mock` is rejected for location/weather.
- `off` is allowed and returns visible unavailable states.
- `http` requires key, host/base URL, timeout, and valid HTTPS provider URL.
- `SEASON_DATE` remains forbidden.
- AI config remains unchanged.

### 6.2 AMap Adapter

Update the HTTP location adapter to parse provider administrative code output and
map it to internal enabled `Region.adminCode`.

Rules:

- Provider raw strings are never public identifiers.
- Raw provider response is not returned or persisted.
- Missing key, timeout, provider error, malformed payload, missing adcode, unknown
  region, or disabled region returns `null`.
- Logs may include provider status and mapped admin code, but not precise raw
  coordinates, keys, Authorization headers, or full provider payloads.

Mock adapter returns deterministic fixture districts from the imported catalog.

### 6.3 QWeather Display Adapter

Add district weather display provider support while keeping existing agricultural
`DailyWeather` semantics isolated.

Planned separation:

- `DistrictWeatherProvider` returns parsed display weather:
  current conditions, observed time, today's min/max, precipitation, humidity,
  wind, warnings, attribution, and a parsed daily forecast slice.
- `WeatherCacheService` caches only validated parsed facts and validated
  attribution data.
- `SeasonalWeatherAdapter` converts the parsed daily forecast into the existing
  internal `DailyWeather[]` shape for the seasonal engine.
- Existing `/api/seasons/now?city_code=` remains compatible with the current
  agricultural weather provider path.

Weather lookup target is always the selected district. No city-level fallback,
climate-proxy fallback, legacy `city_code` fallback, or representative-district
fallback is allowed for weather. QWeather lookup may use the selected district
centroid or a provider LocationID for that same selected district. If LocationID
is introduced, it is an internal cache/catalog field and not part of the public
region contract unless the AC is amended.

Public weather attribution object:

```json
{
  "name": "string | null",
  "url": "string | null",
  "sources": ["string"]
}
```

Attribution rules:

- HTTP QWeather responses use `name="和风天气/QWeather"` and
  `url="https://www.qweather.com"`.
- QWeather `refer.sources` and weather-warning source names are passed through
  completely and without rewriting in `attribution.sources`.
- `off` and `mock` use contract-defined null/static attribution and must not
  pretend to be a real external provider.
- Cache hits must render the same attribution as provider responses.

Failure modes return weather `status="unavailable"` and do not overwrite valid
unexpired cache rows.

## 7. Nearest Proxy Algorithm

Implement a pure function module:

- `server/src/regions/haversine.ts`
- `server/src/regions/resolve-agri-region.ts`

Algorithm:

1. Validate selected enabled district region.
2. Check approved direct mapping.
3. If absent, compute Haversine distance from selected district centroid to every
   approved enabled `ClimateAnchor`.
4. Sort by distance ascending, then `proxy_admin_code` ascending.
5. Return nearest proxy with `distance_km` rounded by a documented deterministic
   rule.

Unit tests must include:

- known Haversine fixture,
- direct mapping returns zero distance and null proxy fields,
- disabled anchor excluded,
- draft anchor excluded,
- tie resolves by `proxy_admin_code` ascending,
- every enabled district resolves in the catalog fixture.

## 8. Seasonal Home API Plan

Add a new module:

- `server/src/seasonal-home/seasonal-home.controller.ts`
- `server/src/seasonal-home/seasonal-home.service.ts`

Endpoint:

```text
GET /api/seasonal/home?admin_code=<district_admin_code>
```

Flow:

1. Validate `admin_code` syntax; invalid syntax returns the frozen HTTP 400
   validation shape.
2. For a well-formed unknown or disabled `admin_code`, return HTTP 200 with
   `region=null`, `agri_region_match.status="unsupported"`, weather unavailable,
   and `seasonal.items=[]`.
3. Load enabled district `Region` and display region fields.
4. Resolve `agri_region_match`; enabled districts must resolve to `direct` or
   `nearest_proxy`.
5. Build server-owned today context.
6. Load selected-district display weather through cache/provider.
7. Convert display daily weather to internal `DailyWeather[]` only when facts are
   present.
8. Call a refactored Seasons internal service method that accepts resolved
   `climateZoneCode`, date, optional user id, and optional internal weather rows.
9. Return exact aggregate shape from S6-AC-08.

The refactor in `SeasonsService` must extract reusable internal assembly without
copying seasonal-engine logic. The old public `now(cityCode, userId)` path remains
exactly compatible and continues to satisfy Slice 3/5 tests.

The `/api/seasonal/home` nested `seasonal` object must not contain
`seasonal.city_code`. Legacy `city_code` exists only on the old
`/api/seasons/now?city_code=` endpoint and must not be inferred or filled for the
new district endpoint.

## 9. Today Calendar Plan

Add:

- `server/src/calendar/today-context.service.ts`
- `server/src/calendar/lunar-provider.interface.ts`
- `server/src/calendar/local-lunar.provider.ts`
- golden fixture tests under `server/src/calendar`.

Runtime rules:

- Date is server-side Asia/Shanghai.
- `SEASON_DATE` affects development/test only.
- Lunar/solar-term values are display-only.
- Unavailable computation returns `lunar.status="unavailable"` and
  `solar_term=null`.
- No external network call is allowed.

Implementation cannot start until the local library/table and
`CALENDAR_ALGORITHM_VERSION` are pinned by manifest or frozen AC. Golden vectors
must include a normal day, lunar month boundary, Chinese New Year, solar-term day,
and non-solar-term day.

## 10. H5 Plan

### 10.1 Three Tabs

Update `App.vue` and router to expose:

- `时令种植`
- `长期种植`
- `我的`

Planned routes:

- `/` redirects or aliases to the new seasonal entry without breaking deep links.
- `/seasonal` renders `SeasonalHome`.
- `/perennials` renders the existing perennial crop selection capability currently
  in `Home.vue`, without new perennial facts or recommendation semantics.
- `/mine` remains unchanged.
- `/seasons/now?city_code=` remains as a compatibility route and may render
  `SeasonalNow` or adapt into `SeasonalHome` without changing the old request
  contract.

### 10.2 RegionPicker

Add `RegionPicker.vue` with:

- popular city list,
- province -> city -> district selection,
- retry on API failure,
- accessible button/list semantics,
- no full directory hardcoded in frontend,
- emits exact selected region object:
  `admin_code`, `name`, `province_name`, `city_name`.

Local persistence:

- `admin_code`
- `name`
- `province_name`
- `city_name`
- `selected_at`

Do not store coordinates, provider raw response, or provider status payloads.

### 10.3 SeasonalHome

First-entry flow:

1. If local selected region exists, load `/api/seasonal/home`.
2. Otherwise, enter visible location flow.
3. If `window.isSecureContext` is false and not localhost development, do not call
   geolocation; show picker.
4. On geolocation success, call `/api/location/resolve`.
5. On district result, persist selected region and load seasonal home.
6. On denied, timeout, null, or HTTP failure, show RegionPicker.

UI must show selected district, date/weekday, lunar/solar term availability,
weather available/partial/unavailable/cache state, direct/proxy climate disclosure,
complete weather attribution, seasonal items, unsupported empty state, and
retry/change-region controls.

### 10.4 TerraceWizard

Replace city-only picker with the shared RegionPicker.

Rules:

- Active district selection auto-advances to the sunlight step.
- Prefilled region from existing profile does not auto-advance.
- Existing `target_crop_id` and `return_to=mine` behavior remains unchanged.
- Submission sends the selected district `admin_code` plus legacy-compatible fields
  required by the server.
- If the profile has only city-level backfill and
  `needs_district_confirmation=true`, show a district confirmation prompt before
  allowing a confirmed district save.

## 11. AC-to-Implementation Matrix

| AC | Implementation plan | Test evidence |
| --- | --- | --- |
| S6-AC-01 | Keep this plan draft while baseline is `TBD`; add scope conflict checklist to delivery report template. | Documentation review; no product implementation until AC freeze. |
| S6-AC-02 | Add `Region` schema, manifest, structured import/check scripts, production image inclusion. | Region invariant tests, checksum gate, import idempotence. |
| S6-AC-03 | Add `/location/regions` and `/location/popular-cities`; preserve `/supported-cities`. | HTTP exact-shape tests and invalid query validation tests. |
| S6-AC-04 | Update location resolver to return enabled district region or `null`; parse AMap adcode. | Provider fixture tests for success/null/failure/malformed/validation/privacy. |
| S6-AC-05 | Implement SeasonalHome first-entry location flow with secure-context guard. | H5 component tests and Playwright insecure/denied/timeout/resolve-null flows. |
| S6-AC-06 | Add shared RegionPicker with popular city then district selection. | RegionPicker unit tests and Playwright manual picker path. |
| S6-AC-07 | Add `RegionClimateMapping`, `ClimateAnchor`, Haversine resolver; syntactically invalid admin codes are 400, well-formed unknown/disabled are 200 unsupported, enabled districts are direct/nearest_proxy only. | Pure function tests, catalog gate, direct/proxy/unsupported HTTP tests, invalid-admin-code validation tests. |
| S6-AC-08 | Add `/seasonal/home` without `seasonal.city_code`; refactor SeasonsService internal assembly; no engine fork; legacy city_code stays only on `/seasons/now`. | HTTP exact-shape tests, no-`seasonal.city_code` assertion, old `/seasons/now` exact compatibility tests. |
| S6-AC-09 | Add server today context service using pinned local calendar artifact. | Golden vector tests and no-network tests. |
| S6-AC-10 | Add selected-district display weather provider/cache, exact attribution object, and daily adapter; no city/proxy weather fallback. | Available/partial/unavailable/cache tests, no defaulted fact assertions, QWeather attribution/source tests, off/mock non-impersonation tests. |
| S6-AC-11 | Add `WeatherCache` and `CalendarContextCache` with validated JSON and validated attribution only. | Cache hit/expired/corrupt/failure-preserves-valid-row tests, cached attribution equality tests. |
| S6-AC-12 | Update App/router to `时令种植`/`长期种植`/`我的` tabs and compat routes. | H5 unit and Playwright tab/deep-link tests. |
| S6-AC-13 | SeasonalHome loads aggregate payload without TerraceProfile. | Fresh identity E2E reaches recommendations or supported fallback without profile. |
| S6-AC-14 | TerraceWizard uses RegionPicker; active select auto-next; prefill no auto-next. | Wizard component tests and targeted Playwright. |
| S6-AC-15 | Secure-context guard; coordinate non-persistence; secret-safe logs/cache. | Privacy unit tests, localStorage assertions, cache JSON assertions. |
| S6-AC-16 | Implement visible failure states across provider, cache, region API, calendar. | Matrix tests covering all table rows. |
| S6-AC-17 | Extend RuntimeConfig with provider off/http/mock and startup validation. | Config positive/negative tests and production smoke. |
| S6-AC-18 | Extend migration upgrade script for Slice5 baseline and 17 legacy city codes. | Fresh/upgrade/idempotent migration gate. |
| S6-AC-19 | Add full automated gate across server/H5/E2E/smoke. | CI matrix and AC-to-test evidence in delivery report. |
| S6-AC-20 | Update production smoke and delivery report evidence requirements. | `npm run test:production-smoke` plus hosted CI evidence. |

## 12. Test Plan

Server unit tests:

- region manifest parser/checksum/hierarchy,
- Haversine and nearest proxy,
- calendar golden vectors,
- weather display parser, attribution, and cache,
- config validation.

Server HTTP/integration tests:

- `/api/location/regions`,
- `/api/location/popular-cities`,
- `/api/location/supported-cities` legacy compatibility,
- `/api/location/resolve`,
- `/api/seasonal/home`,
- `/api/seasonal/home` syntactically invalid `admin_code` -> 400,
- `/api/seasonal/home` well-formed unknown/disabled -> 200 with `region=null`,
  unsupported match, weather unavailable, and empty items,
- `/api/seasonal/home` response has no nested `seasonal.city_code`,
- `/api/seasons/now?city_code=beijing` exact compatibility,
- `/api/crops/:id?city_code=` compatibility.

Migration tests:

- fresh database to Slice 6,
- Slice 5 frozen database to Slice 6,
- second `prisma migrate deploy`,
- 17 legacy city code backfills,
- preservation of User, UserIdentity, TerraceProfile, UserMaterialInventory,
  PlantingRecord, PlantingEvent, AI explanation cache, and AI provider usage.

H5 unit tests:

- RegionPicker loading/error/retry/selection,
- SeasonalHome secure-context/no-geolocation/picker/provider states,
- three-tab active route and deep link,
- TerraceWizard active auto-next vs prefill no auto-next,
- localStorage privacy.

Browser E2E:

- first-use seasonal tab with geolocation resolve success,
- first-use seasonal tab denied/timeout/manual district selection,
- popular city shortcut requires district selection,
- `时令种植`/`长期种植`/`我的` tabs preserve navigation and old routes,
- old S3 seasonal route still supports `city_code=beijing`,
- TerraceWizard target crop and `return_to=mine` still work.

Production smoke:

- production config validates,
- provider `off` mode returns visible unavailable states,
- H5 can reach manual district selection through production ingress,
- selected district returns today context and direct/proxy agricultural region state,
- selected district weather never falls back to city/proxy weather identity,
- QWeather attribution is visible when HTTP fixture mode is exercised; provider
  `off` and `mock` do not pretend to be QWeather,
- weather unavailable does not break seasonal usability,
- draft agricultural facts remain hidden,
- health live/ready/content semantics unchanged.

Representative commands after implementation:

```text
npm --prefix server run build
npm --prefix server run test:unit
npm --prefix server run test:integration
npm run test:migration-upgrade
npm --prefix h5 run test
npm --prefix h5 run build
npm run test:browser
npm run test:production-smoke
```

## 13. Delivery Evidence Requirements

The Slice 6 Delivery Report must include:

- final Slice 5 baseline SHA replacing `TBD`,
- final Slice 6 product SHA,
- AC-to-test evidence matrix,
- exact command list and exit codes,
- region dataset manifest source/version/checksum/row counts,
- calendar algorithm/table version and golden-vector evidence,
- provider fixture versions,
- weather attribution evidence, including QWeather name/link, complete
  `refer.sources`, complete warning source names, off/mock attribution behavior,
  and cache-hit attribution preservation,
- migration fresh/upgrade/idempotent evidence,
- production smoke output,
- explicit no-scope-drift statement:
  no new crop, variety, recipe, soil, lifecycle, sowing-calendar, or AI behavior
  changes; no seasonal engine semantic change; only allowed region-to-climate
  mapping facts and nearest-proxy algorithm added.

## 14. Implementation Stop Conditions

Stop and revise AC/plan before coding if any task requires:

- replacing `TBD` with an unknown baseline,
- promoting draft agricultural fixtures,
- adding or changing crop/variety/soil/lifecycle/sowing facts,
- changing seasonal-engine ranking or hard-filter semantics,
- requiring real provider keys in CI,
- storing precise coordinates,
- returning provider raw payloads,
- depending on an external network call for lunar/solar-term context,
- removing or weakening legacy `city_code` routes,
- weakening Slice 5 AI, health, auth, CORS, or production draft-isolation
  contracts.

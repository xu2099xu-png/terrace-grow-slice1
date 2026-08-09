# Slice 6 Implementation Plan v0.1 - Region-First Seasonal Home

> Status: DRAFT / NOT APPROVED FOR IMPLEMENTATION.
> Aligned draft: `Slice6-Acceptance-Criteria-v0.1.md`.
> Baseline: Slice 5 final frozen product commit `5b91de6af0194fdb437fb858834fd5d7c47833d4`.

This plan is a drafting artifact only. Product-code implementation must not begin
while the Slice 6 AC is not frozen. The Slice 5 baseline gate has been satisfied
by the externally accepted PASS/FROZEN exact 40-character product-code SHA above.
A delivery report commit, branch, tag, candidate label, or non-40-character
reference must be rejected. If this plan conflicts with the AC, the AC wins and
this plan must be revised before implementation starts.

## 1. Scope Boundary

Slice 6 adds a region-first seasonal entry, district weather display, server-owned
today context, and three-tab H5 IA. It must not change crop, variety, container,
soil, lifecycle, sowing-calendar, AI, auth, CORS, health, or existing seasonal
engine semantics.

The Epic is superseded only where the frozen Slice 6 AC explicitly narrows or
mechanizes the contract. Do not use Slice 6 to perform broad refactors, rename
unrelated APIs, or reorganize unrelated H5/server modules.

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
- `isMunicipality Boolean`
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

Direct-controlled municipalities use the official municipality/province-level
row as the parent of district rows. The importer, Region model, popular API, H5
picker, and tests derive municipality behavior from catalog/API machine fields;
they must not create, persist, or emit fake city-level codes. Picker
presentation may show a city step for usability, but that display step points to
the municipality's canonical province-level `adminCode`.

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

### 4.3 Region Directory Public Contract Notes

`/api/location/regions` response rows must expose `is_municipality` as a public
machine field. Ordinary city/prefecture rows and district rows return `false`;
direct-controlled municipality province rows return `true`.

For a direct-controlled municipality parent, `GET /api/location/regions`
with `level=city&parent_admin_code=<municipality_admin_code>` returns `[]`.
H5 requests `level=district&parent_admin_code=<municipality_admin_code>`
directly. No plan step may hardcode a list of municipality names in H5 logic; the
frontend follows the API's `is_municipality` and popular-row `kind` fields.

`/api/location/popular-cities` display code rules:

- `kind="city"`: `display_area_code` equals `city_admin_code`.
- `kind="municipality"`: `display_area_code` equals `province_admin_code` and
  `city_admin_code=null`.

For a district under a direct-controlled municipality, `city_name` is display
only and may equal `province_name`; it must not imply a city-level
administrative code.

### 4.4 Weather Cache

Add `WeatherCache` for parsed public/internal weather facts only.

Planned unique key:

- `selectedAreaCode`
- `provider`
- `providerEndpointVersion`
- `bucket`
- `parserVersion`

Do not name this weather cache key `adminCode`, `climateAreaCode`, or any other
ambiguous region field. Weather cache identity is the selected-area identity
only.

Planned fields:

- `cacheKeyHash String @unique`
- `selectedAreaCode String`
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
`metadata.attributions[]`, any legacy warning `refer.sources[]`, and
weather-warning source names.

### 4.5 Calendar Cache

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
- date coverage range,
- checksum if table-backed,
- golden fixture dates.

### 4.6 TerraceProfile Legacy Migration

Do not remove or reinterpret `cityCode` in Slice 6.

Add:

- `regionAdminCode String?`
- `needsDistrictConfirmation Boolean @default(false)`

Migration/backfill rule:

- For the 17 legacy city codes, set `regionAdminCode` to the matching
  city/prefecture-level or municipality canonical `admin_code`, not a guessed
  district.
- For Beijing, Tianjin, Shanghai, and any future direct-controlled municipality
  legacy values, set `regionAdminCode` to the municipality's official
  province-level `admin_code`, because Slice 6 must not invent a city code.
- For ordinary legacy values, set `regionAdminCode` to the matching official
  city/prefecture-level `admin_code`.
- Set `needsDistrictConfirmation=true`.
- Preserve `cityCode` so existing Slice 1-5 flows keep working.
- New confirmed district submissions set `regionAdminCode` to a district code and
  `needsDistrictConfirmation=false`.

The backfill must be deterministic and verified by upgrade tests for all 17 legacy
values listed in S6-AC-18.

## 5. Dataset Manifest and Import Gate

Use repository-controlled structured data plus a manifest. Do not use raw SQL
string hacks to construct or parse catalog data.

The administrative source manifest is frozen in AC section 0.1:

- dataset: `mca-national-geonames-admin-divisions-mainland-maxlevel3`,
- source owner: `中华人民共和国民政部 / 中国-国家地名信息库`,
- source URL:
  `https://dmfw.mca.gov.cn/9095/xzqh/getList?code=&maxLevel=3`,
- snapshot date: `2026-08-09`,
- import date: `2026-08-09`,
- canonical code standard: GB/T 2260-compatible 6-digit public `admin_code`
  derived from the first six digits of the official 12-digit MCA source code,
- Slice 6 scope: Mainland China only; exclude Hong Kong SAR `810000000000` and
  Macao SAR `820000000000` from enabled rows,
- row counts: 31 province, 333 city/prefecture, 2847 district/county, 0
  disabled/retired, 3211 total enabled rows,
- raw source row counts before scope exclusion: 33 province, 333
  city/prefecture, 2847 district/county,
- raw source SHA-256:
  `a880ff2c2fc76f7e15c42dcef9476bd353fd48a2ce3ea397140358211636700e`,
- normalized mainland hierarchy SHA-256:
  `1e72730c812e5306081dda3745086d6cfef58333332aad2faf0f8bd97b8960f0`,
- initial alias/supersession SHA-256 for minified `[]`:
  `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`.

Implementation must materialize the repository-controlled catalog files from
that frozen source and must add delivery-time checksums for generated
`regions.json`, `popular-cities.json`, climate mappings, anchors, and
alias/supersession files. Those generated Slice 6 data files are product
artifacts and must be included in the final Delivery Report; they must not alter
the frozen upstream source row counts, canonical codes, or municipality
hierarchy.

Direct-controlled municipalities must keep the official province-level
municipality code as the district parent. The importer, APIs, H5 picker, and
legacy backfill must not generate or persist fake city-level municipality codes.

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

The import is idempotent. A checksum mismatch, invalid hierarchy, fake
municipality city code, unknown climate zone, disabled anchor, missing legacy
city mapping, unresolved enabled district, or unreviewed code retirement entry is
a gate failure.

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
- QWeather daily forecast v1 keeps the frozen Slice 3 dedicated host and
  `X-QW-Api-Key` authentication contract. Do not silently route it through a
  generic display-weather host or query-token fallback.

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

Daily forecast contract:

- Keep the frozen Slice 3 Daily Forecast v1 contract:
  `/weather/v1/daily/{latitude}/{longitude}`.
- Keep exact consumed paths `days[].forecastStartTime`,
  `days[].temperatureMin.value`, and `days[].temperatureMax.value`.
- Keep dedicated provider host and `X-QW-Api-Key` auth.
- Keep frost unknown. Do not infer frost from current weather, warnings,
  temperature, precipitation, or QWeather display facts in Slice 6.
- Do not replace this with any QWeather v7 daily fixture contract.
- No fallback to legacy city, climate proxy, representative district, alternate
  endpoint, or static agricultural weather facts is allowed.

Display current-weather and warning contracts are new Slice 6 display-only
contracts and must be pinned separately from the frozen Daily Forecast v1
contract.

Weather lookup target is always the selected district. No city-level fallback,
climate-proxy fallback, legacy `city_code` fallback, or representative-district
fallback is allowed for weather. QWeather lookup may use the selected district
centroid or a provider LocationID for that same selected district. If LocationID
is introduced, it is an internal cache/catalog field and not part of the public
region contract unless the AC is amended.

Weather provider/cache keys, provider calls, fixture names, logs, and public
weather fields use the selected district identity only. When
`selected_area_code != climate_area_code`, weather still performs zero
climate-proxy retry attempts; provider failure returns unavailable weather for
the selected district rather than retrying the proxy district.

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
- QWeather `metadata.attributions[]`, any legacy warning `refer.sources[]`, and
  weather-warning source names are passed through completely and without
  rewriting in `attribution.sources`.
- QWeather ratio fields used for public percentages are accepted only as finite
  `[0, 1]` numbers and converted with `Math.round(ratio * 100)`. Missing,
  non-finite, or out-of-range values stay `null`; adapters must not default
  humidity or precipitation probability.
- Because the frozen current-weather contract consumes no provider observation
  timestamp, `observed_at` is `null` for QWeather current v1 unless the AC is
  re-frozen with an explicit observation-time path. `updated_at` is the server
  parse/cache refresh time.
- Provider-contract fixtures must include exact provider fields needed by each
  adapter as pinned in AC section 0.3. Public responses must not leak extra raw
  provider data.
- `off` and `mock` use contract-defined null/static attribution and must not
  pretend to be a real external provider.
- Cache hits must render the same attribution as provider responses.

Failure modes return weather `status="unavailable"` and do not overwrite valid
unexpired cache rows.

### 6.4 Weather Provider-Contract Manifest

The QWeather provider-contract manifest is frozen in AC section 0.3 for:

- display current: `GET /weather/v1/current/{latitude}/{longitude}`,
  fixture SHA-256
  `b33eb93a7e52ebdfdca0a55d10fe6d8b7b7b2b93c89a05c65b904c3d5ebab3bd`,
  parser `qweather-current-v1-display-parser@1`;
- frozen Daily Forecast v1: `GET /weather/v1/daily/{latitude}/{longitude}`,
  fixture SHA-256
  `6d513171fa80d53565317cb4e4ac52077b5b7b4c5447c38d764bfe1d96ca915d`,
  parser `qweather-daily-v1-agri-display-parser@1`;
- display warning: `GET /weatheralert/v1/current/{latitude}/{longitude}`,
  fixture SHA-256
  `3178e3d29692cfdbe7d6ea70ec018b9a7fc7f631247e2b5ba6b1fff7ce58d46e`,
  parser `qweather-weatheralert-v1-display-parser@1`.

Implementation must consume the exact official endpoint paths, official
documentation URLs, documentation snapshot date, `X-QW-Api-Key` auth header,
dedicated QWeather API Host contract, `{latitude}/{longitude}` coordinate order,
consumed JSON paths, attribution paths, fixture checksums, and parser versions
from AC section 0.3.

The Daily Forecast v1 entry pins
`/weather/v1/daily/{latitude}/{longitude}`, dedicated host, `X-QW-Api-Key`,
`days[].forecastStartTime`, `days[].temperatureMin.value`,
`days[].temperatureMax.value`, and frost unknown.

The attribution gate remains mandatory for display current/warning and cache-hit
paths. Moving daily forecast back to the frozen Slice 3 contract must not weaken
visible QWeather name/link, ordered `metadata.attributions[]`, warning source
names, cache equality, or off/mock non-impersonation assertions.

## 7. Nearest Proxy Algorithm

Implement a pure function module:

- `server/src/regions/haversine.ts`
- `server/src/regions/resolve-agri-region.ts`

Algorithm:

1. Validate selected enabled district region.
2. Check approved direct mapping.
3. If absent, compute Haversine distance from selected district centroid to every
   approved enabled `ClimateAnchor`.
4. Sort by distance ascending, then proxy anchor `climate_area_code` ascending.
5. Return nearest proxy with `distance_km` rounded by a documented deterministic
   rule.

Unit tests must include:

- known Haversine fixture,
- direct mapping returns zero distance and null proxy fields,
- disabled anchor excluded,
- draft anchor excluded,
- tie resolves by proxy anchor `climate_area_code` ascending,
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

The public `agri_region_match` contract and internal typed request must carry
these machine fields without reintroducing legacy `city_code`:

- `selected_area_code`: the requested/selected district `admin_code` when it is
  syntactically well-formed; for unsupported branches this preserves the request
  code.
- `climate_area_code`: the district or proxy anchor code used to derive the
  agricultural climate context; `null` for unsupported.
- `proxy_used`: boolean, `false` for direct and unsupported, `true` only for
  nearest proxy.

Required mapping examples:

| Branch | `selected_area_code` | `climate_area_code` | `proxy_used` |
| --- | --- | --- | --- |
| direct | same as selected district | same as selected district | `false` |
| nearest_proxy | selected district | different proxy anchor code | `true` |
| unsupported | well-formed request code | `null` | `false` |

Tests must include at least one enabled selected-district fixture where
`selected_area_code != climate_area_code` and prove that seasonal recommendations
use the climate proxy while weather lookup/cache/provider calls still use only
`selected_area_code`.

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
  `solar_term=null`; Gregorian `date`, `weekday`, and `timezone` remain
  populated from the Asia/Shanghai civil day.
- No external network call is allowed.

The calendar algorithm is frozen in AC section 0.2 as
`lunar-javascript@1.7.7`, algorithm version
`terrace-calendar-lunar-javascript-1.7.7-asia-shanghai-v1`, supported
Gregorian range `1900-01-31..2100-12-31` inclusive, and outside-range behavior
`date`/`weekday` still populated plus `lunar.status=unavailable` and
`solar_term=null`. Golden vectors in AC section 0.2 are mandatory implementation
tests.

Boundary rules:

- Today context uses Asia/Shanghai local date at 00:00 boundary.
- Solar-term instants are converted to Asia/Shanghai local dates before
  populating `solar_term`.
- Golden tests must include boundary dates around local midnight and solar-term
  instants so UTC/day-shift bugs block Freeze.

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
- ordinary province -> city/prefecture -> district selection,
- direct-controlled municipality canonical municipality -> district selection,
- retry on API failure,
- accessible button/list semantics,
- no full directory hardcoded in frontend,
- emits exact selected region object:
  `admin_code`, `name`, `province_name`, `city_name`.

Popular city rows must preserve `kind="city | municipality"`. For
municipalities, the picker may render a city-like presentation step, but that
presentation step must not generate, request, persist, or emit a fake city code.
It loads districts using the canonical municipality `province_admin_code`, keeps
`city_admin_code=null`, and stores/submits only the final district
`admin_code`.

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
| S6-AC-01 | Keep this plan draft while Slice 6 AC is not frozen; use only external PASS/FROZEN exact 40-char Slice 5 product SHA `5b91de6af0194fdb437fb858834fd5d7c47833d4`; add limited-Epic-supersession and no-broad-refactor stop checks. | Documentation review; SHA validator/evidence check; no product implementation until AC freeze. |
| S6-AC-02 | Add `Region` schema, complete manifest, structured import/check scripts, municipality semantics, alias/retirement metadata, production image inclusion. | Region invariant tests, manifest complete-field gate, checksum gate, municipality no-fake-code fixture, import idempotence. |
| S6-AC-03 | Add `/location/regions` with public `is_municipality`; add `/location/popular-cities` with exact city/municipality display-code rules; preserve `/supported-cities`. | HTTP exact-shape tests, municipality city-query-empty test, popular display-code tests, invalid query validation tests. |
| S6-AC-04 | Update location resolver to return enabled district region or `null`; parse AMap adcode. | Provider fixture tests for success/null/failure/malformed/validation/privacy. |
| S6-AC-05 | Implement SeasonalHome first-entry location flow with secure-context guard. | H5 component tests and Playwright insecure/denied/timeout/resolve-null flows. |
| S6-AC-06 | Add shared RegionPicker with ordinary province -> city/prefecture -> district and municipality -> district paths. | RegionPicker unit tests and Playwright coverage for both ordinary and municipality picker paths. |
| S6-AC-07 | Add `RegionClimateMapping`, `ClimateAnchor`, Haversine resolver; syntactically invalid admin codes are 400, well-formed unknown/disabled are 200 unsupported, enabled districts are direct/nearest_proxy only. | Pure function tests, catalog gate, direct/proxy/unsupported HTTP tests, invalid-admin-code validation tests, selected-different-from-climate fixture. |
| S6-AC-08 | Add `/seasonal/home` with typed `selected_area_code`/`climate_area_code`/`proxy_used`, without `seasonal.city_code`; refactor SeasonsService internal assembly; no engine fork; legacy city_code stays only on `/seasons/now`. | HTTP exact-shape tests, direct same/false, nearest different/true, unsupported request/null/false tests, no-`seasonal.city_code` assertion, old `/seasons/now` exact compatibility tests. |
| S6-AC-09 | Add server today context service using pinned local calendar artifact. | Golden vector tests, Asia/Shanghai 00:00 boundary tests, solar-term local-date conversion tests, no-network tests. |
| S6-AC-10 | Add selected-district display weather provider/cache, exact attribution object, and daily adapter; no city/proxy weather fallback. | Available/partial/unavailable/cache tests, zero climate-proxy weather retry test, no defaulted fact assertions, QWeather exact fixture/visible href/source/warning tests, off/mock non-impersonation tests. |
| S6-AC-11 | Add `WeatherCache` and `CalendarContextCache` with validated JSON and validated attribution only. | Cache hit/expired/corrupt/failure-preserves-valid-row tests, cached attribution equality tests, selected-district-only cache key tests. |
| S6-AC-12 | Update App/router to `时令种植`/`长期种植`/`我的` tabs and compat routes. | H5 unit and Playwright tab/deep-link tests. |
| S6-AC-13 | SeasonalHome loads aggregate payload without TerraceProfile. | Fresh identity E2E reaches recommendations or supported fallback without profile. |
| S6-AC-14 | TerraceWizard uses RegionPicker; active select auto-next; prefill no auto-next. | Wizard component tests and targeted Playwright. |
| S6-AC-15 | Secure-context guard; coordinate non-persistence; secret-safe logs/cache. | Privacy unit tests, localStorage assertions, cache JSON assertions. |
| S6-AC-16 | Implement visible failure states across provider, cache, region API, calendar. | Matrix tests covering all table rows. |
| S6-AC-17 | Extend RuntimeConfig with provider off/http/mock and startup validation. | Config positive/negative tests and production smoke. |
| S6-AC-18 | Extend migration upgrade script for Slice5 baseline and 17 legacy city codes, distinguishing municipality province-level backfill from ordinary city/prefecture backfill. | Fresh/upgrade/idempotent migration gate and all-17 legacy mapping assertions. |
| S6-AC-19 | Add full automated gate across server/H5/E2E/smoke. | CI matrix and AC-to-test evidence in delivery report. |
| S6-AC-20 | Update production smoke and delivery report evidence requirements, including manifest completeness, QWeather attribution accessibility, calendar provenance, and scope-stop evidence. | `npm run test:production-smoke` plus hosted CI evidence. |

## 12. Test Plan

Server unit tests:

- region manifest parser/checksum/hierarchy,
- manifest complete source owner, URL, license or usage basis, snapshot date,
  version, import date, canonical code standard, row counts, checksums, and code
  retirement policy,
- municipality hierarchy and no fake city-code invariant,
- Haversine and nearest proxy,
- selected-different-from-climate fixture with deterministic proxy result,
- calendar manifest pinning, Asia/Shanghai 00:00 boundary, solar-term instant to
  local-date conversion, and golden vectors,
- weather display parser, provider-contract manifest-driven display
  current/warning fixture paths, attribution, and cache,
- display current fixture/parser tests derive exact consumed paths from the
  Freeze-time provider-contract manifest; this plan does not define those paths,
- frozen Daily Forecast v1 fixture consumed keys exactly
  `days[].forecastStartTime`, `days[].temperatureMin.value`, and
  `days[].temperatureMax.value`, using `/weather/v1/daily/{latitude}/{longitude}`
  with dedicated host and `X-QW-Api-Key`,
- Daily Forecast v1 parser keeps frost unknown and rejects any fallback to a
  QWeather v7 daily fixture contract,
- display warning fixture/parser tests derive exact consumed paths from the
  Freeze-time provider-contract manifest; this plan does not define those paths,
- QWeather warning fixture contains and preserves both `refer.sources[]` and
  `alerts[].senderName` in attribution/display tests,
- QWeather public `humidity_percent` and `precipitation_probability_percent`
  conversion tests cover valid 0..1 ratios, missing values, non-finite values,
  and out-of-range values,
- QWeather current-weather parser tests assert `observed_at=null` for the frozen
  v1 fixture because no observation-time path is consumed,
- selected-district-only weather lookup/cache and zero climate-proxy retry on
  weather failure,
- config validation.

Server HTTP/integration tests:

- `/api/location/regions`,
- `/api/location/regions` exact rows include `is_municipality`,
- direct-controlled municipality `level=city` query returns `[]`,
- direct-controlled municipality district query uses the municipality canonical
  `parent_admin_code`,
- `/api/location/popular-cities`,
- `/api/location/popular-cities` `kind="city"` rows use
  `display_area_code=city_admin_code`,
- `/api/location/popular-cities` `kind="municipality"` rows use
  `display_area_code=province_admin_code`,
- `/api/location/popular-cities` municipality rows use `city_admin_code=null` and
  district loading under `province_admin_code`,
- location resolve district under a municipality returns display-only `city_name`,
- `/api/location/supported-cities` legacy compatibility,
- `/api/location/resolve`,
- `/api/seasonal/home`,
- `/api/seasonal/home` syntactically invalid `admin_code` -> 400,
- `/api/seasonal/home` well-formed unknown/disabled -> 200 with `region=null`,
  unsupported match, weather unavailable, and empty items,
- `/api/seasonal/home` direct returns `selected_area_code` equal to
  `climate_area_code` and `proxy_used=false`,
- `/api/seasonal/home` nearest proxy returns different `selected_area_code` and
  `climate_area_code` with `proxy_used=true`,
- `/api/seasonal/home` unsupported returns request `selected_area_code`,
  `climate_area_code=null`, and `proxy_used=false`,
- `/api/seasonal/home` response has no nested `seasonal.city_code`,
- `/api/seasons/now?city_code=beijing` exact compatibility,
- `/api/crops/:id?city_code=` compatibility.

Migration tests:

- fresh database to Slice 6,
- Slice 5 frozen database to Slice 6,
- second `prisma migrate deploy`,
- 17 legacy city code backfills,
- Beijing, Tianjin, and Shanghai legacy values backfill to municipality
  province-level `admin_code`; ordinary values backfill to city/prefecture-level
  `admin_code`,
- preservation of User, UserIdentity, TerraceProfile, UserMaterialInventory,
  PlantingRecord, PlantingEvent, AI explanation cache, and AI provider usage.

H5 unit tests:

- RegionPicker loading/error/retry/selection,
- RegionPicker ordinary province -> city/prefecture -> district path,
- RegionPicker municipality -> district path using canonical municipality code,
- RegionPicker municipality presentation does not persist fake city code,
- SeasonalHome secure-context/no-geolocation/picker/provider states,
- SeasonalHome renders and exposes accessible QWeather attribution link with exact
  href when provided by the server,
- three-tab active route and deep link,
- TerraceWizard active auto-next vs prefill no auto-next,
- localStorage privacy.

Browser E2E:

- first-use seasonal tab with geolocation resolve success,
- first-use seasonal tab denied/timeout/manual district selection,
- popular city shortcut requires district selection,
- ordinary province -> city/prefecture -> district manual picker path,
- municipality -> district manual picker path with no fake city-code request,
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
- QWeather fixture smoke verifies exact visible link text, exact
  `https://www.qweather.com` href, complete ordered sources, warnings, and cache
  equality,
- selected-different-from-climate fixture proves provider/cache lookup uses
  selected district and performs zero climate proxy weather retries,
- weather unavailable does not break seasonal usability,
- calendar manifest version/checksum/provenance/range is printed, and golden
  boundary fixtures pass,
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

- final Slice 5 baseline SHA
  `5b91de6af0194fdb437fb858834fd5d7c47833d4`, and proof it is an external
  PASS/FROZEN exact 40-character product-code SHA,
- final Slice 6 product SHA,
- AC-to-test evidence matrix,
- exact command list and exit codes,
- region dataset manifest source owner, source URL, license or usage basis,
  snapshot date, source version, import date, canonical code standard, row
  counts, checksums, and code retirement policy,
- municipality proof that picker/API/migration store no fake city code,
- seasonal home machine-field evidence for direct same/false, nearest
  different/true, and unsupported request/null/false:
  `selected_area_code`, `climate_area_code`, `proxy_used`,
- selected-district-only weather evidence, including selected-different-from
  climate fixture and zero climate-proxy retry count,
- calendar exact local library/table name, version, checksum, provenance,
  supported date range, algorithm version, Asia/Shanghai boundary, solar-term
  local-date conversion, and golden-vector evidence,
- provider-contract manifest entries for display current, frozen Daily Forecast
  v1, and display warning, including official supported endpoint path/version,
  official documentation URL, documentation snapshot date, auth header and host,
  exact consumed JSON paths, attribution JSON paths, fixture checksums, and
  parser versions,
- weather attribution evidence against the referenced QWeather attribution page,
  including QWeather name/link, complete ordered `metadata.attributions[]`,
  complete warning source names, exact accessible `https://www.qweather.com` href,
  off/mock attribution behavior, and cache-hit attribution preservation,
- migration fresh/upgrade/idempotent evidence,
- production smoke output,
- explicit no-scope-drift statement:
  no new crop, variety, recipe, soil, lifecycle, sowing-calendar, or AI behavior
  changes; no seasonal engine semantic change; only allowed region-to-climate
  mapping facts and nearest-proxy algorithm added.

## 14. Implementation Stop Conditions

Stop and revise AC/plan before coding if any task requires:

- replacing the Slice 5 baseline with anything other than the external
  PASS/FROZEN exact 40-character product-code SHA
  `5b91de6af0194fdb437fb858834fd5d7c47833d4`,
- leaving any required region dataset manifest or calendar manifest field as
  `TBD` at Freeze,
- leaving any required weather provider-contract manifest field as `TBD` at
  Freeze,
- promoting draft agricultural fixtures,
- adding or changing crop/variety/soil/lifecycle/sowing facts,
- implementing perennial A/B, perennial catalog expansion, ecommerce evidence, or
  soil/material recipe redesign,
- changing seasonal-engine ranking or hard-filter semantics,
- broad refactoring outside the files/modules required for the frozen AC,
- requiring real provider keys in CI,
- storing precise coordinates,
- returning provider raw payloads,
- depending on an external network call for lunar/solar-term context,
- performing weather fallback/retry against city, climate proxy, legacy
  `city_code`, or representative district when selected-district weather fails,
- removing or weakening legacy `city_code` routes,
- weakening Slice 5 AI, health, auth, CORS, or production draft-isolation
  contracts.

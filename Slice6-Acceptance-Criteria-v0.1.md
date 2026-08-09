# Slice 6 Acceptance Criteria v0.1 - 全国区县位置、今日上下文与三 Tab IA

> Status: DRAFT / NOT FROZEN
> Baseline: Slice 5 final frozen product candidate `TBD`

Slice 6 implementation MUST NOT begin until Slice 5 is explicitly PASS / FROZEN
and the final Slice 5 product-code SHA replaces `TBD` in this document.

This document is an acceptance contract draft. It is not implementation
permission.

## 1. Product Contract

Slice 6 makes the app usable from a location-first, zero-profile seasonal entry:

- nationwide province/city/district directory with stable administrative codes,
- first seasonal-tab visit asks for device location when browser security allows,
- failure or refusal falls back to popular cities and three-level manual picker,
- selected district drives precise weather display and a mapped agricultural
  climate context,
- the first screen shows today's Gregorian date, weekday, lunar date, solar term
  if applicable, district weather, and seasonal recommendations,
- H5 navigation uses three top-level tabs: 时令种植、长期种植、我的.

Slice 6 must not change agricultural recommendation meaning. It may widen the
location input surface and add display-only calendar/weather context, but the
existing seasonal/weather agricultural filtering semantics remain frozen.

## 2. Explicitly In Scope

- A governed nationwide administrative-region catalog down to district/county
  level, keyed by official administrative code.
- A small agricultural climate-zone model with direct mappings and deterministic
  nearest-proxy mappings.
- District-precise current weather and today's summary for display.
- A server-owned today context: Gregorian date, weekday, lunar date, and solar
  term.
- H5 first-entry location flow for the 时令种植 tab.
- H5 three-tab IA skeleton: 时令种植、长期种植、我的.
- Home/时令种植 entry no longer requires a TerraceProfile.
- TerraceWizard region selection auto-advances only on active user selection.
- Runtime config, privacy controls, cache contracts, migrations, tests, CI, and
  production smoke updates required by this Slice.

## 3. Explicitly Out of Scope

Slice 6 must not implement:

- new perennial A/B recommendation models,
- new perennial crop content, variety facts, container facts, soil formulas, or
  material recipes,
- new seasonal crops, sowing windows, lifecycle templates, or agricultural fact
  seed data,
- AI ranking, AI weather interpretation, AI location inference, or AI content
  review,
- open-domain chat or provider-side tool calling,
- push notifications, reminders, mini-program, ecommerce, or map UI,
- household address capture, precise-coordinate profile storage, or location
  history,
- agricultural fact data outside the region-to-climate mapping explicitly
  allowed by this Slice,
- changing lifecycle, perennial, soil, sunlight, governance, auth, CORS, health,
  or existing AI explanation contracts.

## 4. P0 Acceptance Criteria

### S6-AC-01 Frozen Baseline and Scope Stop Rule

Slice 6 starts only after Slice 5 is frozen. The implementation baseline must be
recorded as:

```text
Slice 5 final frozen product candidate: <sha>
```

`TBD` is not acceptable in the final frozen Slice 6 AC.

Implementation must stop and record a scope conflict if any required change
would:

- alter seasonal-engine eligibility, ranking, date-window, weather hard-filter,
  or unknown/unsupported semantics;
- alter WeatherProvider agricultural facts beyond the frozen internal fields;
- require agricultural facts outside the Slice 6 region-to-climate mapping data
  and algorithm;
- require promotion of draft fixtures to approved;
- require changes to Slice 5 AI explanation behavior;
- require a real third-party provider in CI.

### S6-AC-02 Administrative Region Catalog

Add a backend-governed nationwide region catalog with stable administrative
codes. The catalog must contain province, city/prefecture, and district/county
levels.

Every region row must include at minimum:

```json
{
  "admin_code": "string",
  "name": "string",
  "level": "province | city | district",
  "parent_admin_code": "string | null",
  "enabled": true,
  "data_version": "string",
  "source": "string",
  "centroid_lng": 0,
  "centroid_lat": 0
}
```

Rules:

- `admin_code` is the public stable region identifier for Slice 6.
- Frontend code must not hardcode the nationwide directory.
- The directory must be loaded from repository-controlled data or migrations with
  recorded provenance and version.
- The directory source must be an official or owner-approved administrative
  division dataset snapshot. Provider geocode responses are not a catalog source.
- Before this AC is frozen, the region dataset snapshot source, version,
  import date, row count, and checksum must be filled into this document or a
  referenced frozen manifest. `TBD` is not acceptable for the dataset snapshot at
  implementation time.
- Unknown, duplicate, orphaned, or cyclic region rows are migration or seed gate
  failures.
- District centroid coordinates are for provider lookup and nearest-proxy
  calculation only; they are not a household location.

### S6-AC-03 Region Directory API Contract

Expose public read-only region APIs:

```text
GET /api/location/regions?parent_admin_code=<code|null>&level=<province|city|district>
GET /api/location/popular-cities
```

`/location/regions` returns exactly:

```json
[
  {
    "admin_code": "string",
    "name": "string",
    "level": "province | city | district",
    "parent_admin_code": "string | null"
  }
]
```

`/location/popular-cities` returns city-level rows with province display
context:

```json
[
  {
    "admin_code": "string",
    "name": "string",
    "level": "city",
    "parent_admin_code": "string",
    "province_name": "string"
  }
]
```

Requirements:

- Results are deterministic and sorted by stable catalog order.
- Disabled rows are never returned.
- Unknown fields are not present.
- Invalid query parameters return the frozen validation error shape.
- Selecting a popular city must open that city's district list. It must not
  silently select a central district or any representative district.
- Existing `/api/location/supported-cities` remains backward-compatible for
  older Slice 3/5 flows until explicitly removed in a future slice.

### S6-AC-04 Location Resolve Contract

`POST /api/location/resolve` accepts only numeric `lat` and `lng`, validates
their ranges, and returns either `null` or one enabled district-level region.

Successful response shape:

```json
{
  "admin_code": "string",
  "name": "string",
  "level": "district",
  "province_name": "string",
  "city_name": "string"
}
```

Rules:

- Provider raw administrative strings must never become public identifiers.
- The server maps provider output to an enabled internal `admin_code`.
- Provider timeout, missing key, HTTP error, malformed response, unsupported
  location, or unknown district returns `null`, not 500.
- The endpoint must not store precise coordinates or raw provider response.
- It remains public and rate-limited under the existing public endpoint abuse
  model.

### S6-AC-05 First Seasonal Tab Location Flow

The 时令种植 tab is the first-use seasonal entry. On first entry without a
selected district:

1. If `window.isSecureContext` is false and the host is not a documented local
   development exception, H5 must not call `navigator.geolocation`.
2. If secure context allows it, H5 asks for geolocation permission.
3. On success, H5 calls `/api/location/resolve`.
4. If resolve returns a district, H5 stores the selected `admin_code` locally and
   loads the seasonal tab.
5. If permission is denied, unavailable, times out, resolve returns `null`, or
   any HTTP error occurs, H5 shows popular cities and the three-level manual
   picker.

This flow must be visible and recoverable. It must not show a blank page, block
navigation to 长期种植/我的, or require a TerraceProfile.

### S6-AC-06 Manual Region Picker Contract

The manual picker must support:

- popular city shortcut list that still requires district selection,
- province -> city -> district three-level selection,
- retry on region API failure,
- keyboard/touch accessible selection controls,
- visible selected district context after selection.

When the user chooses a district, the selected region stored locally is:

```json
{
  "admin_code": "string",
  "name": "string",
  "province_name": "string",
  "city_name": "string",
  "selected_at": "ISO string"
}
```

No raw coordinates or provider response may be stored in localStorage.

### S6-AC-07 Region to Agricultural Climate Mapping

Agricultural climate matching is separate from weather location.

Each enabled district must resolve to an agricultural climate context by exactly
one of:

```text
direct
nearest_proxy
```

`unsupported` is allowed only for a well-formed unknown or disabled admin code.
Syntactically invalid admin codes return the frozen HTTP 400 validation shape.
It is not a normal result for an enabled district.

The new `GET /api/seasonal/home?admin_code=` response must include this region
and agricultural-match contract. This section does not add fields to legacy
`GET /api/seasons/now?city_code=`.

Enabled-district variant:

```json
{
  "region": {
    "admin_code": "string",
    "name": "string",
    "province_name": "string",
    "city_name": "string"
  },
  "agri_region_match": {
    "status": "direct",
    "climate_zone_code": "north_china",
    "proxy_admin_code": null,
    "proxy_name": null,
    "distance_km": 0
  }
}
```

Well-formed unknown/disabled branch:

```json
{
  "region": null,
  "agri_region_match": {
    "status": "unsupported",
    "climate_zone_code": null,
    "proxy_admin_code": null,
    "proxy_name": null,
    "distance_km": null
  }
}
```

Rules:

- Direct mappings are curated governed agricultural mapping data added by Slice
  6.
- Proxy anchors are enabled governed agricultural mapping rows with
  `admin_code`, `climate_zone_code`, centroid, source, version, and review
  metadata.
- Nearest proxy is deterministic:
  - distance uses the Haversine formula over catalog centroids,
  - candidates are only enabled governed proxy anchors,
  - distance is returned in kilometers,
  - ties sort by `proxy_admin_code` ascending,
  - every enabled district must have either direct mapping or a nearest proxy.
- Proxy matching must be disclosed in the UI as approximate agricultural-region
  matching.
- `unsupported` returns no agricultural recommendations and is valid only for a
  well-formed unknown or disabled admin code.
- For `direct`, `proxy_admin_code=null`, `proxy_name=null`, and
  `distance_km=0`.
- For `unsupported`, `climate_zone_code=null`, `proxy_admin_code=null`,
  `proxy_name=null`, and `distance_km=null`.
- Weather remains based on the selected district, never the proxy district.
- Region-to-climate direct mappings, proxy anchors, and the nearest-proxy
  algorithm are the only new governed agricultural mapping facts allowed in
  Slice 6. They must not introduce new crop, variety, recipe, or calendar facts.

### S6-AC-08 Seasonal Home Aggregation API

The Slice 6 H5 seasonal home path uses one aggregation endpoint:

```text
GET /api/seasonal/home?admin_code=<district_admin_code>
```

It returns exactly one server-owned payload containing region, today, weather,
and seasonal recommendation data.

Enabled-district variant:

```json
{
  "today": {
    "date": "YYYY-MM-DD",
    "weekday": "string",
    "timezone": "Asia/Shanghai",
    "lunar": {
      "status": "available | unavailable",
      "month": "string | null",
      "day": "string | null"
    },
    "solar_term": "string | null"
  },
  "region": {
    "admin_code": "string",
    "name": "string",
    "province_name": "string",
    "city_name": "string"
  },
  "agri_region_match": {
    "status": "nearest_proxy",
    "climate_zone_code": "north_china",
    "proxy_admin_code": "110105",
    "proxy_name": "朝阳区",
    "distance_km": 12.3
  },
  "weather": {
    "status": "available | partial | unavailable",
    "source": "string | null",
    "observed_at": "ISO string | null",
    "updated_at": "ISO string | null",
    "cache_hit": "boolean",
    "attribution": {
      "name": "string | null",
      "url": "string | null",
      "sources": ["string"]
    },
    "summary": "string",
    "temperature_current_c": "number | null",
    "temperature_min_c": "number | null",
    "temperature_max_c": "number | null",
    "condition": "string | null",
    "precipitation_mm": "number | null",
    "precipitation_probability_percent": "number | null",
    "humidity_percent": "number | null",
    "wind": "string | null",
    "warnings": ["string"]
  },
  "seasonal": {
    "date": "YYYY-MM-DD",
    "location_status": "ok | unavailable",
    "climate_zone_code": "string | null",
    "climate_data_status": "available | unsupported",
    "weather_data_status": "available | partial | unavailable",
    "has_profile": "boolean",
    "items": [],
    "warnings": ["string"]
  }
}
```

Well-formed unknown/disabled branch overrides the enabled-district fields as:

```json
{
  "region": null,
  "agri_region_match": {
    "status": "unsupported",
    "climate_zone_code": null,
    "proxy_admin_code": null,
    "proxy_name": null,
    "distance_km": null
  },
  "weather": {
    "status": "unavailable",
    "source": null,
    "observed_at": null,
    "updated_at": null,
    "cache_hit": false,
    "attribution": {
      "name": null,
      "url": null,
      "sources": []
    },
    "summary": "",
    "temperature_current_c": null,
    "temperature_min_c": null,
    "temperature_max_c": null,
    "condition": null,
    "precipitation_mm": null,
    "precipitation_probability_percent": null,
    "humidity_percent": null,
    "wind": null,
    "warnings": ["地区不可用"]
  },
  "seasonal": {
    "date": "YYYY-MM-DD",
    "location_status": "unavailable",
    "climate_zone_code": null,
    "climate_data_status": "unsupported",
    "weather_data_status": "unavailable",
    "has_profile": false,
    "items": [],
    "warnings": ["地区不可用"]
  }
}
```

Rules:

- The endpoint must reuse the existing Seasons path internally after resolving
  the district to its direct/proxy climate zone. It must not duplicate seasonal
  eligibility or ranking logic.
- Syntactically invalid `admin_code` returns the frozen HTTP 400 validation
  shape.
- Well-formed disabled or unknown `admin_code` returns HTTP 200 with
  `region=null`, `agri_region_match.status="unsupported"`,
  `weather.status="unavailable"`, and `seasonal.items=[]`.
- Supported direct/proxy mappings call the existing seasonal recommendation path
  with the resolved climate zone.
- The engine receives the same internal crop/calendar/weather structure as
  before; Slice 6 must not change eligibility, ranking, weather hard-filter, or
  unknown handling.
- Existing `GET /api/seasons/now?city_code=<legacy_city_code>` remains exact
  backward-compatible: no existing public fields may be deleted, renamed, or
  have their meaning changed. Legacy `city_code` belongs only to that old
  endpoint and must not appear in the new `/api/seasonal/home` public payload.

### S6-AC-09 Today Calendar Context

Add a server-owned today context for the selected district:

```json
{
  "date": "YYYY-MM-DD",
  "weekday": "string",
  "timezone": "Asia/Shanghai",
  "lunar": {
    "status": "available | unavailable",
    "month": "string | null",
    "day": "string | null"
  },
  "solar_term": "string | null"
}
```

Rules:

- The date source is server-side and uses Asia/Shanghai.
- `SEASON_DATE` may affect this only in development/test, and remains forbidden
  in production.
- Lunar and solar-term calculation must use a pinned local algorithm or table
  with `algorithm_version`.
- Freeze requires authoritative golden vectors for representative dates,
  including a normal day, a lunar month boundary, Chinese New Year, a solar-term
  day, and a non-solar-term day.
- Runtime calculation must not depend on external network calls.
- Lunar date and solar term are display-only.
- Lunar date or solar term must not affect seasonal recommendations, weather
  filtering, lifecycle stage, or AI explanation facts in this Slice.
- If the calendar library/table cannot compute a value, the API must return a
  visible unavailable state for that field rather than inventing a value.

### S6-AC-10 District Weather Display Contract

Add district-precise current weather and today's summary for display.

Public shape:

```json
{
  "weather": {
    "status": "available | partial | unavailable",
    "source": "string | null",
    "observed_at": "ISO string | null",
    "updated_at": "ISO string | null",
    "cache_hit": "boolean",
    "attribution": {
      "name": "string | null",
      "url": "string | null",
      "sources": ["string"]
    },
    "summary": "string",
    "temperature_current_c": "number | null",
    "temperature_min_c": "number | null",
    "temperature_max_c": "number | null",
    "condition": "string | null",
    "precipitation_mm": "number | null",
    "precipitation_probability_percent": "number | null",
    "humidity_percent": "number | null",
    "wind": "string | null",
    "warnings": ["string"]
  }
}
```

Rules:

- The selected district's admin code or centroid is used for weather lookup.
- Weather lookup target is always the selected district. No city-level fallback,
  climate-proxy fallback, legacy `city_code` fallback, or representative-district
  fallback is allowed for weather.
- `source` identifies the provider or static mode used for attribution.
- `observed_at` is the provider observation time when available.
- `updated_at` is the server time when the parsed weather payload was produced
  or refreshed.
- `attribution` is mandatory in the weather object.
- For HTTP QWeather, H5 must visibly display `和风天气/QWeather` and
  `https://www.qweather.com`.
- For HTTP QWeather, provider `refer.sources` and weather-warning source names
  must be passed through and displayed completely without rewriting.
- For `off` and `mock`, attribution uses the contract-defined null/static values
  and must not pretend to be a real external provider.
- Weather summary is display-only unless transformed into the existing frozen
  internal `DailyWeather` fields used by the seasonal engine.
- Missing weather facts remain missing. Do not default temperature, humidity,
  wind, precipitation, rain probability, or frost.
- Provider failure, timeout, no key, malformed response, or exhausted provider
  quota returns `status="unavailable"` and empty/neutral display fields, not 500.
- H5 must clearly show whether weather is available, partial, cached, or
  unavailable.

### S6-AC-11 Weather and Calendar Cache

Use server-side caching for provider-backed weather and deterministic today
context.

Weather cache key must include:

- `admin_code`,
- provider,
- provider endpoint/schema version,
- date or observation bucket,
- parser/schema version.

Weather cache rows must store parsed public/internal facts only. They must not
store provider keys, raw provider responses containing unnecessary fields, raw
coordinates beyond catalog centroids, JWTs, user identifiers, or Authorization
headers.

Weather cache rows must preserve parsed attribution data, including QWeather
`refer.sources` and weather-warning source names, so cache hits display the same
visible attribution as provider responses.

TTL rules:

- current weather TTL is explicit configuration;
- calendar/lunar cache is keyed by `date + timezone + algorithm_version`;
- stale or corrupt cache rows are treated as misses;
- provider failure does not overwrite a valid cache row unless the row is
  expired.
- `AI_PROVIDER=off` and AI cache/readiness behavior from Slice 5 are unchanged;
  weather/calendar cache is an independent subsystem.

### S6-AC-12 H5 Three-Tab IA

H5 must expose three top-level tabs with these exact UI labels:

```text
时令种植
长期种植
我的
```

Rules:

- 时令种植 is the default product entry and does not require a TerraceProfile.
- 长期种植 links to existing perennial crop/plan capability only.
- 我的 keeps existing profile, materials, and planting records access.
- Tab navigation must not break existing routes or deep links.
- No new perennial A/B model, new perennial agriculture content, or new
  recommendation semantics may be introduced.
- The first screen must show real product content, not a marketing landing page.

### S6-AC-13 Home / 时令种植 First Screen

The first screen for a new user must let them get seasonal recommendations
without creating a terrace profile.

It must load from `GET /api/seasonal/home?admin_code=<district_admin_code>` after
region resolution or manual selection and show:

- selected district display name,
- server Gregorian date and weekday,
- lunar date and solar term if available,
- district weather status and today's summary,
- seasonal recommendation list or unsupported/empty recovery state.

No card or CTA may imply that a terrace profile is required before seasonal
recommendations.

### S6-AC-14 TerraceWizard Region Selection

TerraceWizard must use the same region directory contract as the 时令种植 tab.

Active user selection behavior:

- user taps/clicks/keyboard-selects a district,
- wizard stores the district `admin_code`,
- wizard automatically advances to the next step.

Prefill behavior:

- loading an existing profile may prefill the saved region,
- prefill must not auto-advance,
- user can review or change the prefilled region before proceeding.

Submission must persist the selected district administrative code. Existing
`target_crop_id` and `return_to=mine` behavior must remain unchanged.

### S6-AC-15 Privacy Contract

Location privacy rules are frozen:

- geolocation is requested only after user enters the 时令种植 location flow;
- insecure HTTP contexts do not trigger browser geolocation except documented
  localhost development behavior;
- precise coordinates are sent only to `/api/location/resolve`;
- precise coordinates are not stored in user profile, localStorage, logs, cache,
  or analytics in this Slice;
- manual selection stores only region administrative code and display names;
- provider keys remain server-side;
- provider raw responses are not returned to H5;
- logs may name status and admin code, but must not print provider keys, JWTs,
  Authorization headers, raw precise coordinates, or raw provider payloads.

### S6-AC-16 Failure and Degradation Matrix

All failure states are visible, recoverable, and non-500 unless validation fails:

| Condition | Required behavior |
| --- | --- |
| Insecure browser context | Do not request geolocation; show picker |
| User denies geolocation | Show popular cities and picker |
| Geolocation timeout/error | Show popular cities and picker |
| Location provider missing/fails | Resolve returns null; H5 picker |
| Region API fails | Visible retry; existing tab navigation remains usable |
| Syntactically invalid admin_code | Frozen HTTP 400 validation shape |
| Well-formed unknown or disabled admin_code | HTTP 200, `region=null`, `agri_region_match.status="unsupported"`, weather unavailable, no fake recommendation |
| Enabled district missing direct/proxy result | Gate failure before release; not a normal runtime branch |
| Weather provider missing/fails | Weather unavailable; seasonal base recommendation still follows frozen rules |
| Calendar computation missing | Calendar field unavailable; no invented lunar/solar term |
| Cache corrupt/expired | Miss and recover; no corrupt public response |

### S6-AC-17 Runtime Configuration

All Slice 6 external/provider behavior must be centralized in runtime config.

At minimum:

- region catalog data version,
- `LOCATION_PROVIDER=off|http|mock`,
- location provider key/base URL or host/timeout,
- `WEATHER_PROVIDER=off|http|mock`,
- weather provider key/base URL or host/timeout,
- weather cache TTL,
- calendar algorithm version,
- production CORS and JWT behavior from Slice 4,
- AI config from Slice 5 unchanged.

Production rules:

- `off` is allowed for CI smoke and returns unavailable UI/provider states.
- `http` in production requires all configured provider key/host fields and
  fails fast if they are absent or invalid.
- reject mock location/weather providers in production;
- reject `SEASON_DATE`;
- fail fast for malformed provider URLs, invalid TTLs, and invalid timeouts;
- error output may name invalid variables but must not print secrets.

CI must not require real provider keys.

Health/readiness rules:

- `health/live`, `health/ready`, and `health/content` retain Slice 4 semantics.
- Provider `off`, weather unavailable, location unavailable, and cache misses do
  not make readiness fail.
- Production `http` provider misconfiguration is a startup config failure, not a
  runtime readiness branch.
- `health/content` must not treat the region catalog, weather cache, lunar
  calendar, or region-to-climate mapping alone as usable crop content.

### S6-AC-18 Migration Contract

Migration verification must cover:

- fresh database to Slice 6,
- Slice 5 frozen database to Slice 6,
- second `prisma migrate deploy` idempotence.

Migration must preserve existing user/product data:

- User,
- UserIdentity,
- TerraceProfile,
- UserMaterialInventory,
- PlantingRecord,
- PlantingEvent,
- AI explanation cache and provider usage rows from Slice 5.

Legacy `TerraceProfile.cityCode` migration is frozen:

- do not guess a district from a legacy city code;
- map each legacy city code to a city-level canonical `admin_code`;
- mark the profile `needs_district_confirmation=true`;
- keep existing profile-dependent flows working with the city-level fallback
  until the user confirms a district;
- prompt the user to choose a district on next relevant edit/entry.

The migration gate must verify all 17 legacy values:

```text
beijing, tianjin, shanghai, hangzhou, nanjing, suzhou, ningbo, hefei, wuxi,
guangzhou, shenzhen, fuzhou, xiamen, nanning, shijiazhuang, jinan, zhengzhou
```

Region directory, weather display facts, and lunar/solar-term display facts are
not crop/variety/soil/lifecycle/sowing-calendar agricultural facts.
Region-to-climate direct mappings, proxy anchors, and the nearest-proxy
algorithm are the only new governed agricultural mapping data allowed in Slice 6.

### S6-AC-19 Automated Test Gate

Final Slice 6 gate must include automated coverage for:

- region catalog invariants: uniqueness, hierarchy, enabled filtering, sorted
  APIs, dataset checksum, no frontend hardcoded full directory;
- nearest-proxy invariants: Haversine distance, enabled governed anchors only,
  distance in km, tie by `proxy_admin_code` ascending, and every enabled district
  resolves to direct or nearest_proxy;
- location resolve success, null, provider failure, invalid lat/lng, and no raw
  provider leak;
- insecure-context, denied, timeout, resolve-null, popular-city, and
  three-level-picker H5 flows;
- `/api/seasonal/home?admin_code=` path with direct, nearest_proxy, unknown or
  disabled `region=null` unsupported, syntactically invalid 400, and
  weather-unavailable states;
- enabled districts never returning `agri_region_match.status="unsupported"`;
- old `/api/seasons/now?city_code=` exact compatibility;
- proof that seasonal eligibility/ranking/weather hard-filter semantics did not
  change from Slice 3/5 regression expectations;
- today calendar Asia/Shanghai date, weekday, pinned lunar/solar-term golden
  vectors, and no external network dependency;
- weather display available, partial, unavailable, cache hit, expired/corrupt
  miss, source attribution, updated time, current/min/max temperature,
  precipitation fields, and no defaulted facts;
- visible QWeather attribution showing `和风天气/QWeather`,
  `https://www.qweather.com`, complete provider `refer.sources`, complete
  weather-warning source names, and no fake external attribution for off/mock;
- TerraceWizard active selection auto-next and prefill no auto-next;
- legacy cityCode migration for all 17 legacy values with
  `needs_district_confirmation=true`;
- three-tab IA navigation, deep-link preservation, and mobile layout stability;
- privacy tests proving no precise coordinates or provider secrets are stored in
  localStorage, cache rows, logs, public responses, or screenshots;
- migration fresh/upgrade/idempotent paths;
- production config negative tests and production smoke.

No test may depend on a real location or weather provider. Provider integration
must use contract fixtures or mock adapters in CI.

### S6-AC-20 Production Smoke and Delivery Evidence

Production smoke must run with:

- `APP_ENV=production`,
- no draft fixture exposure,
- no real provider key requirement,
- Slice 5 AI defaults preserved.

Smoke must prove:

- health live/ready/content semantics remain unchanged except for documented
  Slice 6 dependencies that are required for startup;
- H5 loads through production ingress;
- anonymous first-use seasonal flow can reach manual district selection;
- selected district returns today context and a deterministic supported or
  approximate agricultural-region state;
- provider config `off` mode returns unavailable location/weather UI without
  requiring real keys;
- QWeather HTTP fixture path visibly displays required attribution and complete
  source names;
- weather unavailable does not make the app unusable;
- no draft agricultural facts are exposed.

The Slice 6 Delivery Report must include:

- final Slice 5 baseline SHA and final Slice 6 SHA,
- AC-to-test evidence matrix,
- exact commands and exit codes,
- migration results,
- production config and smoke output,
- any provider-contract fixture versions,
- QWeather attribution evidence against
  `https://dev.qweather.com/docs/terms/attribution/`,
- region dataset snapshot source/version/checksum,
- calendar algorithm version and golden-vector evidence,
- explicit statement that no new crop/variety/recipe/soil/lifecycle/sowing
  content or changed seasonal filtering semantics were introduced, and that
  Slice 6 added only the allowed governed region-to-climate mapping data and
  nearest-proxy algorithm.

## 5. Definition of Done

Slice 6 is accepted only when:

1. Slice 5 is PASS / FROZEN and the baseline SHA is filled in.
2. This AC document is frozen before product-code changes begin.
3. S6-AC-01 through S6-AC-20 pass.
4. Slice 1-5 regression gates remain green.
5. Production still hides draft agricultural facts.
6. Location/weather/calendar provider failures degrade visibly and recoverably.
7. Independent review has no unresolved P0/P1 findings.

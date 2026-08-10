#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT/docker-compose.production.yml"
PROJECT_NAME="${SMOKE_PROJECT_NAME:-terrace_s4_${$}}"
H5_PORT="${H5_PORT:-$((20000 + ($$ % 20000)))}"

export POSTGRES_USER="terrace_prod_test"
export POSTGRES_PASSWORD="slice4-db-password"
export POSTGRES_DB="terrace_prod_test"
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public"
export JWT_SECRET="slice4-container-smoke-jwt-secret-value-0001"
export CORS_ORIGINS="http://127.0.0.1:${H5_PORT}"
export APP_ENV="production"
export AI_PROVIDER="off"
export LOCATION_PROVIDER="off"
export WEATHER_PROVIDER="off"
export REGION_CATALOG_VERSION="mca-xzqh-mainland-2026-08-09"
export H5_PORT

compose() {
  docker compose --project-name "$PROJECT_NAME" --file "$COMPOSE_FILE" --profile smoke "$@"
}

cleanup() {
  status="${1:-$?}"
  if [ "$status" -ne 0 ]; then
    compose ps >&2 || true
    compose logs --no-color postgres server h5 >&2 || true
  fi
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  exit "$status"
}

on_exit() {
  status=$?
  if [ -n "${tmp:-}" ]; then rm -rf "$tmp"; fi
  cleanup "$status"
}

trap on_exit EXIT INT TERM

fail() {
  echo "production smoke: FAIL: $*" >&2
  exit 1
}

http_code() {
  curl -sS -o "$2" -w '%{http_code}' "$1"
}

echo "[smoke] project=$PROJECT_NAME port=$H5_PORT APP_ENV=production"
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  compose build server h5
fi

echo "[smoke] checking server image artifacts"
server_image="${PROJECT_NAME}-server:latest"
docker image inspect "$server_image" >/dev/null 2>&1 || fail "server image is unavailable"
docker run --rm --entrypoint sh "$server_image" \
  -c 'test ! -e .env && test ! -d test && test ! -d node_modules/.cache' \
  || fail "server image contains forbidden development artifacts"

compose up -d --wait --wait-timeout 240 postgres server h5 client-a client-b

BASE_URL="http://127.0.0.1:${H5_PORT}"
tmp="$(mktemp -d)"

[ "$(http_code "$BASE_URL/api/health/live" "$tmp/live.json")" = "200" ] || fail "liveness"
[ "$(cat "$tmp/live.json")" = '{"status":"live"}' ] || fail "liveness body"
[ "$(http_code "$BASE_URL/api/health/ready" "$tmp/ready.json")" = "200" ] || fail "readiness"
[ "$(cat "$tmp/ready.json")" = '{"status":"ready"}' ] || fail "readiness body"
[ "$(http_code "$BASE_URL/api/health/content" "$tmp/content.json")" = "503" ] || fail "content status"
[ "$(cat "$tmp/content.json")" = '{"status":"not_ready"}' ] || fail "content body"

[ "$(http_code "$BASE_URL/" "$tmp/h5.html")" = "200" ] || fail "H5 ingress"
grep -q '<div id="app"' "$tmp/h5.html" || fail "H5 ingress app root missing"

node - "$BASE_URL" <<'NODE' || fail "production H5 first-use manual district selection"
const { chromium } = require('@playwright/test');
const baseUrl = process.argv[2];
function fail(message) {
  throw new Error(message);
}
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_success, error) => {
          error({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
        },
      },
    });
  });
  await page.goto(`${baseUrl}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/#\/location/, { timeout: 30000 });
  await page.getByRole('heading', { name: '选择用于时令推荐的区县' }).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByText('未授权定位', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByText('浏览器未授权定位，请手动选择区县。').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByTestId('region-picker').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByTestId('province-option').filter({ hasText: '浙江省' }).click();
  await page.getByRole('tab', { name: '城市' }).click();
  await page.getByTestId('city-option').filter({ hasText: '杭州市' }).click();
  await page.getByRole('tab', { name: '区县' }).click();
  await page.getByTestId('district-option').filter({ hasText: '上城区' }).click();
  await page.waitForURL((url) => !url.hash.startsWith('#/location'), { timeout: 30000 });
  await page.getByText('浙江省 · 杭州市 · 上城区').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByText('区县天气').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByText('今天').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByText('今日推荐').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByText(/20\d{2}-\d{2}-\d{2} · 周/).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByText('天气暂不可用', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  if (await page.getByRole('link', { name: '和风天气/QWeather', exact: true }).count() !== 0) {
    fail('QWeather attribution must not be visible while provider is off');
  }
  const selected = await page.evaluate(() => JSON.parse(localStorage.getItem('terrace:selected-region') || 'null'));
  if (!selected || selected.admin_code !== '330102' || selected.name !== '上城区') {
    fail(`unexpected selected region ${JSON.stringify(selected)}`);
  }
  await browser.close();
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
NODE

[ "$(http_code "$BASE_URL/api/location/regions?level=district&parent_admin_code=110000" "$tmp/beijing-districts.json")" = "200" ] \
  || fail "region district API"
node - "$tmp/beijing-districts.json" <<'NODE' || fail "municipality district API body"
const fs = require('node:fs');
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(rows)) process.exit(1);
const first = rows[0];
if (!first || first.admin_code !== '110101' || first.parent_admin_code !== '110000') process.exit(1);
if (first.is_municipality !== false) process.exit(1);
NODE

[ "$(http_code "$BASE_URL/api/seasonal/home?admin_code=330106" "$tmp/seasonal-home.json")" = "200" ] \
  || fail "seasonal home selected/proxy fixture"
node - "$tmp/seasonal-home.json" <<'NODE' || fail "seasonal home selected/proxy provider-off body"
const fs = require('node:fs');
const body = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!body.today || typeof body.today.date !== 'string' || body.today.timezone !== 'Asia/Shanghai') process.exit(1);
if (!body.region || body.region.admin_code !== '330106') process.exit(1);
const match = body.agri_region_match;
if (!match || match.selected_area_code !== '330106') process.exit(1);
if (match.status !== 'nearest_proxy' || match.proxy_used !== true) process.exit(1);
if (match.climate_area_code !== '330102') process.exit(1);
if (match.distance_km !== 7.4) process.exit(1);
if (!body.weather || body.weather.status !== 'unavailable' || body.weather.source !== null) process.exit(1);
if (body.weather.attribution?.name !== null || body.weather.attribution?.url !== null) process.exit(1);
if (!body.seasonal || !Array.isArray(body.seasonal.items)) process.exit(1);
NODE
QWEATHER_CACHE_BUCKET="$(node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[1]));if(!x.today?.date)process.exit(1);process.stdout.write(x.today.date)" "$tmp/seasonal-home.json")"

echo "[smoke] seeding QWeather fixture cache"
compose exec -T server node dist/scripts/seed-qweather-fixture-cache.js \
  --selected-area-code 330106 \
  --cache-bucket "$QWEATHER_CACHE_BUCKET" \
  --fixture-today 2026-08-09 \
  >"$tmp/qweather-seed.json" \
  || fail "QWeather fixture cache seed"
node - "$tmp/qweather-seed.json" <<'NODE' || fail "QWeather fixture cache seed body"
const fs = require('node:fs');
const body = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
assert(body.status === 'seeded', `unexpected seed status ${body.status}`);
assert(body.selected_area_code === '330106', `unexpected seed selected_area_code ${body.selected_area_code}`);
assert(body.cache_bucket.length === 10, `unexpected seed cache_bucket ${body.cache_bucket}`);
assert(body.fixture_today === '2026-08-09', `unexpected fixture_today ${body.fixture_today}`);
assert(body.fixture_now === '2026-08-09T04:00:00.000Z', `unexpected fixture_now ${body.fixture_now}`);
assert(body.cache_hit === true, `seed cache_hit was ${body.cache_hit}`);
assert(body.expires_at_is_future === true, `seed expires_at_is_future was ${body.expires_at_is_future}`);
assert(new Date(body.expires_at).getTime() > new Date(body.cache_now).getTime(), `seed cache expired: ${body.cache_now} >= ${body.expires_at}`);
assert(body.fetch_fixture_calls === 3, `unexpected fixture fetch calls ${body.fetch_fixture_calls}`);
NODE

echo "[smoke] restarting server with production WEATHER_PROVIDER=http against seeded cache"
export WEATHER_PROVIDER="http"
export WEATHER_PROVIDER_BASE_URL="https://qweather-fixture.invalid"
export WEATHER_PROVIDER_API_KEY="smoke-fixture-key"
export WEATHER_PROVIDER_TIMEOUT_MS="1000"
compose up -d --wait --wait-timeout 240 --force-recreate server h5 >/dev/null \
  || fail "server restart with QWeather http fixture config"

[ "$(http_code "$BASE_URL/api/seasonal/home?admin_code=330106" "$tmp/qweather-home-1.json")" = "200" ] \
  || fail "QWeather fixture seasonal home first"
[ "$(http_code "$BASE_URL/api/seasonal/home?admin_code=330106" "$tmp/qweather-home-2.json")" = "200" ] \
  || fail "QWeather fixture seasonal home second"
node - "$tmp/qweather-home-1.json" "$tmp/qweather-home-2.json" <<'NODE' || fail "QWeather fixture API cache equality"
const fs = require('node:fs');
const first = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const second = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const expectedSources = [
  'https://developer.qweather.com/attribution.html',
  'https://developer.qweather.com/attribution.html',
  'https://developer.qweather.com/attribution.html',
  'Alert data may be delayed or out of date. Refer to official sources for the latest data.',
  '杭州市气象台',
  '国家预警信息发布中心',
  '中国天气网',
];
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function assertWeather(body, label) {
  assert(body.region?.admin_code === '330106', `${label}: expected region.admin_code=330106, got ${body.region?.admin_code}`);
  const match = body.agri_region_match;
  assert(match?.selected_area_code === '330106', `${label}: expected selected_area_code=330106, got ${match?.selected_area_code}`);
  assert(match.climate_area_code === '330102', `${label}: expected climate_area_code=330102, got ${match.climate_area_code}`);
  assert(match.status === 'nearest_proxy', `${label}: expected nearest_proxy, got ${match.status}`);
  assert(match.proxy_used === true, `${label}: expected proxy_used=true, got ${match.proxy_used}`);
  assert(match.distance_km === 7.4, `${label}: expected distance_km=7.4, got ${match.distance_km}`);
  const weather = body.weather;
  assert(weather?.status === 'available', `${label}: expected weather.status=available, got ${weather?.status}`);
  assert(weather.source === 'qweather', `${label}: expected weather.source=qweather, got ${weather.source}`);
  assert(weather.cache_hit === true, `${label}: expected cache_hit=true, got ${weather.cache_hit}`);
  assert(weather.attribution?.name === '和风天气/QWeather', `${label}: unexpected attribution.name ${weather.attribution?.name}`);
  assert(weather.attribution?.url === 'https://www.qweather.com', `${label}: unexpected attribution.url ${weather.attribution?.url}`);
  assert(JSON.stringify(weather.attribution.sources) === JSON.stringify(expectedSources), `${label}: unexpected attribution.sources ${JSON.stringify(weather.attribution.sources)}`);
  assert(weather.warnings.includes('杭州市气象台发布暴雨蓝色预警'), `${label}: warning missing from ${JSON.stringify(weather.warnings)}`);
  assert(weather.observed_at === null, `${label}: expected observed_at=null, got ${weather.observed_at}`);
}
assertWeather(first, 'first');
assertWeather(second, 'second');
assert(JSON.stringify(first.weather) === JSON.stringify(second.weather), `weather cache equality failed: first=${JSON.stringify(first.weather)} second=${JSON.stringify(second.weather)}`);
NODE

node - "$BASE_URL" <<'NODE' || fail "QWeather fixture H5 visibility"
const { chromium } = require('@playwright/test');
const baseUrl = process.argv[2];
const expectedSources = [
  'https://developer.qweather.com/attribution.html',
  'https://developer.qweather.com/attribution.html',
  'https://developer.qweather.com/attribution.html',
  'Alert data may be delayed or out of date. Refer to official sources for the latest data.',
  '杭州市气象台',
  '国家预警信息发布中心',
  '中国天气网',
];
function fail(message) {
  throw new Error(message);
}
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('terrace:selected-region', JSON.stringify({
      admin_code: '330106',
      name: '西湖区',
      province_name: '浙江省',
      city_name: '杭州市',
      selected_at: '2026-08-10T00:00:00.000Z',
    }));
  });
  await page.goto(`${baseUrl}/#/`, { waitUntil: 'domcontentloaded' });
  const anchor = page.getByRole('link', { name: '和风天气/QWeather', exact: true });
  await anchor.waitFor({ state: 'visible', timeout: 30000 });
  const href = await anchor.getAttribute('href');
  if (href !== 'https://www.qweather.com') fail(`unexpected QWeather href ${href}`);
  const weatherPanel = page.locator('.summary-card').filter({ hasText: '区县天气' }).first();
  await weatherPanel.waitFor({ state: 'visible', timeout: 30000 });
  const panelText = await weatherPanel.innerText({ timeout: 30000 });
  if (!panelText.includes('缓存')) fail('cache badge is not visible');
  if (!panelText.includes('杭州市气象台发布暴雨蓝色预警')) fail('warning headline is not visible');
  let lastIndex = -1;
  for (const source of expectedSources) {
    const index = panelText.indexOf(source, lastIndex + 1);
    if (index <= lastIndex) fail(`source order missing or unstable: ${source}`);
    lastIndex = index;
  }
  await browser.close();
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
NODE

[ "$(http_code "$BASE_URL/api/crops?life_type=seasonal" "$tmp/seasonal.json")" = "200" ] || fail "seasonal catalog"
[ "$(cat "$tmp/seasonal.json")" = '[]' ] || fail "draft seasonal content leaked"
[ "$(http_code "$BASE_URL/api/crops?life_type=perennial" "$tmp/perennial.json")" = "200" ] || fail "perennial catalog"
[ "$(cat "$tmp/perennial.json")" = '[]' ] || fail "draft perennial content leaked"

curl -sS -X POST -H 'Content-Type: application/json' \
  -d '{"device_id":"production-smoke-device"}' \
  "$BASE_URL/api/auth/anonymous" >"$tmp/auth.json"
TOKEN="$(node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[1]));if(!x.token)process.exit(1);process.stdout.write(x.token)" "$tmp/auth.json")"

ai_code="$(curl -sS -o "$tmp/ai.json" -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"context_type":"seasonal_item","question":"为什么现在种它？","city_code":"beijing","crop_id":"crop-carrot"}' \
  "$BASE_URL/api/ai/ask")"
[ "$ai_code" = "200" ] || fail "AI off draft-free context must return 200"
node - "$tmp/ai.json" <<'NODE' || fail "AI off insufficient_data body"
const fs = require('node:fs');
const body = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const expectedKeys = ['answer', 'cache_hit', 'citations', 'source', 'status', 'warnings'];
const actualKeys = Object.keys(body).sort();
if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) process.exit(1);
if (body.status !== 'insufficient_data') process.exit(1);
if (body.answer !== '') process.exit(1);
if (body.source !== 'rules') process.exit(1);
if (body.cache_hit !== false) process.exit(1);
if (!Array.isArray(body.citations) || body.citations.length !== 0) process.exit(1);
if (!Array.isArray(body.warnings)) process.exit(1);
NODE

curl -sS -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/materials" >"$tmp/materials.json"
[ "$(cat "$tmp/materials.json")" = '[]' ] || fail "draft materials leaked"
curl -sS -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/users/me/plantings" >"$tmp/plantings.json"
[ "$(cat "$tmp/plantings.json")" = '[]' ] || fail "unexpected planting/lifecycle data"
[ "$(curl -sS -o "$tmp/recommendation.json" -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"crop_id":"crop-blueberry"}' "$BASE_URL/api/recommendations/perennial")" = "400" ] \
  || fail "empty governed recommendation must be 4xx"

echo "[smoke] checking container users"
[ "$(compose exec -T server id -u | tr -d '\r')" != "0" ] || fail "server runs as root"
[ "$(compose exec -T h5 id -u | tr -d '\r')" != "0" ] || fail "h5 runs as root"

echo "[smoke] checking idempotent migration deployment"
compose exec -T server ./node_modules/.bin/prisma migrate deploy >/dev/null \
  || fail "second prisma migrate deploy failed"

echo "[smoke] checking network exposure and startup failure"
server_bindings="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$(compose ps -q server)")"
postgres_bindings="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$(compose ps -q postgres)")"
h5_bindings="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$(compose ps -q h5)")"
[ "$server_bindings" = "{}" ] || fail "server port is externally published"
[ "$postgres_bindings" = "{}" ] || fail "postgres port is externally published"
[ "$h5_bindings" != "{}" ] || fail "h5 ingress port is not published"

if compose run --rm --no-deps \
  -e DATABASE_URL=postgresql://invalid:invalid@postgres:5432/missing_database \
  server >/dev/null 2>&1; then
  fail "invalid database startup unexpectedly succeeded"
fi

echo "[smoke] checking ingress rate-limit isolation"
index=1
while [ "$index" -le 20 ]; do
  code="$(compose exec -T client-a curl -sS -o /dev/null -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' \
    -H "X-Forwarded-For: 198.51.100.${index}" \
    -d "{\"device_id\":\"rate-client-a-${index}\"}" \
    http://h5:8080/api/auth/anonymous | tr -d '\r')"
  [ "$code" = "201" ] || fail "client A request $index returned $code"
  index=$((index + 1))
done

headers="$(compose exec -T client-a curl -sS -D - -o /dev/null \
  -X POST -H 'Content-Type: application/json' \
  -H 'X-Forwarded-For: 203.0.113.200' \
  -d '{"device_id":"rate-client-a-blocked"}' \
  http://h5:8080/api/auth/anonymous | tr -d '\r')"
echo "$headers" | head -n 1 | grep -q ' 429 ' || fail "client A was not rate limited"
retry_after="$(echo "$headers" | awk 'BEGIN{IGNORECASE=1} /^Retry-After:/{print $2; exit}')"
[ -n "$retry_after" ] && [ "$retry_after" -gt 0 ] || fail "Retry-After missing"

client_b_code="$(compose exec -T client-b curl -sS -o /dev/null -w '%{http_code}' \
  -X POST -H 'Content-Type: application/json' \
  -d '{"device_id":"rate-client-b"}' \
  http://h5:8080/api/auth/anonymous | tr -d '\r')"
[ "$client_b_code" = "201" ] || fail "client A consumed client B bucket"

echo "production smoke: PASS"

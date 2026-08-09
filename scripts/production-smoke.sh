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

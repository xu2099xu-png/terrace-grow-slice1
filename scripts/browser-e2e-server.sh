#!/bin/sh
# Slice 2 browser E2E: start NestJS backend + vite preview together.
# Playwright treats this single process as the webServer; it must keep running.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
E2E_API_PORT="${E2E_API_PORT:-3000}"
E2E_H5_PORT="${E2E_H5_PORT:-5173}"

export DATABASE_URL="postgresql://terrace:terrace@localhost:5433/terrace_grow_test?schema=public"
export APP_ENV=development
export ALLOW_DRAFT_FIXTURES=true
export PORT="$E2E_API_PORT"
export E2E_API_PORT
export E2E_H5_PORT
export VITE_API_PROXY_TARGET="http://127.0.0.1:${E2E_API_PORT}"

# Slice 3 deterministic E2E:
#  - LOCATION_RESOLVER=mock: geolocation resolves to a seeded city (beijing)
#  - SEASON_DATE: fixed "today" so sowing windows deterministically hit
#  - WEATHER_PROVIDER left as http (no key → unavailable) → Golden Path B
#    asserts graceful degradation ("暂未结合近期天气") while recommendations exist
export LOCATION_RESOLVER=mock
export LOCATION_PROVIDER=mock
export WEATHER_PROVIDER=off
export SEASON_DATE=2026-03-20
export AI_PROVIDER=mock

echo "[browser-e2e] deploying test migrations..."
(cd "$ROOT/server" && npm run db:migrate >/dev/null)

echo "[browser-e2e] checking and importing Slice 6 region catalog..."
(cd "$ROOT/server" && npm run catalog:check >/dev/null && npm run catalog:import >/dev/null)

echo "[browser-e2e] building server..."
(cd "$ROOT/server" && npm run build >/dev/null)

echo "[browser-e2e] building h5..."
(cd "$ROOT/h5" && npm run build >/dev/null)

echo "[browser-e2e] starting backend :${E2E_API_PORT} ..."
(cd "$ROOT/server" && node dist/src/main.js) &
BACKEND_PID=$!

echo "[browser-e2e] starting h5 dev :${E2E_H5_PORT} ..."
(cd "$ROOT/h5" && npx vite --host 127.0.0.1 --port "$E2E_H5_PORT" --strictPort) &
H5_PID=$!

# forward signals so Playwright can stop both
trap 'kill $BACKEND_PID $H5_PID 2>/dev/null' INT TERM EXIT

echo "[browser-e2e] ready."
wait

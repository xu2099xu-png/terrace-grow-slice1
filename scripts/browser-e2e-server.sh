#!/bin/sh
# Slice 2 browser E2E: start NestJS backend + vite preview together.
# Playwright treats this single process as the webServer; it must keep running.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

export DATABASE_URL="postgresql://terrace:terrace@localhost:5433/terrace_grow_test?schema=public"
export APP_ENV=development
export ALLOW_DRAFT_FIXTURES=true

echo "[browser-e2e] building h5..."
(cd "$ROOT/h5" && npm run build >/dev/null)

echo "[browser-e2e] starting backend :3000 ..."
(cd "$ROOT/server" && node dist/src/main.js) &
BACKEND_PID=$!

echo "[browser-e2e] starting h5 dev :5173 ..."
(cd "$ROOT/h5" && npx vite --host 127.0.0.1 --port 5173 --strictPort) &
H5_PID=$!

# forward signals so Playwright can stop both
trap 'kill $BACKEND_PID $H5_PID 2>/dev/null' INT TERM EXIT

echo "[browser-e2e] ready."
wait

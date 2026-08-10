#!/bin/sh
set -eu

./node_modules/.bin/prisma migrate deploy
REGION_CATALOG_DIR="${REGION_CATALOG_DIR:-data/regions/${REGION_CATALOG_VERSION:-mca-xzqh-mainland-2026-08-09}}"
node dist/scripts/check-region-catalog.js "$REGION_CATALOG_DIR"
node dist/scripts/import-region-catalog.js "$REGION_CATALOG_DIR"
node dist/scripts/check-region-catalog.js "$REGION_CATALOG_DIR"
exec node dist/src/main.js

#!/usr/bin/env node
/**
 * Test database management for Slice 1.
 *
 * Guarantees a repeatable, isolated test database:
 *   tests are verified against `terrace_grow_test`, never the dev DB.
 *
 * Commands:
 *   setup   - create test DB (if missing), run `prisma migrate deploy`, then seed fixtures
 *   reset   - drop + recreate test DB, migrate deploy, seed
 *   drop    - drop test DB (teardown)
 *
 * The base connection params come from .env / .env.example (DATABASE_URL),
 * with the database name swapped to `terrace_grow_test`.
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SERVER_DIR = path.resolve(__dirname, '..');
const TEST_DB_NAME = 'terrace_grow_test';
// local docker postgres container (see docker-compose.yml / README)
const PG_CONTAINER = 'terrace-grow-postgres';

/** Read DATABASE_URL from .env, falling back to .env.example. */
function readBaseUrl() {
  for (const file of ['.env', '.env.example']) {
    const p = path.join(SERVER_DIR, file);
    if (!fs.existsSync(p)) continue;
    const m = fs
      .readFileSync(p, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('DATABASE_URL='));
    if (m) return m.replace(/^DATABASE_URL=["']?|["']?\s*$/g, '');
  }
  throw new Error('DATABASE_URL not found in server/.env or server/.env.example');
}

/** Swap the database name in a connection URL. */
function withDbName(url, dbName) {
  const clean = url.split('?')[0];
  const tail = url.includes('?') ? `?${url.split('?')[1]}` : '';
  const parts = clean.split('/');
  parts[parts.length - 1] = dbName;
  return `${parts.join('/')}${tail}`;
}

const BASE_URL = readBaseUrl();
const TEST_URL = withDbName(BASE_URL, TEST_DB_NAME);

/** Execute a shell command with a given DATABASE_URL, inheriting stdio. */
function run(cmd, env = {}) {
  execSync(cmd, {
    stdio: 'inherit',
    cwd: SERVER_DIR,
    env: { ...process.env, ...env },
  });
}

/** Run a SQL statement inside the postgres container via psql. */
function psql(sql) {
  execSync(
    `docker exec ${PG_CONTAINER} psql -U terrace -d postgres -v ON_ERROR_STOP=1 -c ${JSON.stringify(sql)}`,
    { stdio: 'inherit' },
  );
}

function dbExists() {
  const out = execSync(
    `docker exec ${PG_CONTAINER} psql -U terrace -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${TEST_DB_NAME}'"`,
    { stdio: ['ignore', 'pipe', 'ignore'] },
  ).toString();
  return out.trim() === '1';
}

function createDb() {
  if (dbExists()) return;
  psql(`CREATE DATABASE "${TEST_DB_NAME}"`);
}

function dropDb() {
  if (!dbExists()) return;
  // terminate lingering connections (e.g. from a previous test run)
  psql(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TEST_DB_NAME}' AND pid <> pg_backend_pid()`,
  );
  psql(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}"`);
}

function migrate() {
  run(`npx prisma migrate deploy`, { DATABASE_URL: TEST_URL });
  // npm ci / clean installs wipe the generated client; regenerate after migrate
  run(`npx prisma generate`, { DATABASE_URL: TEST_URL });
}

function seed() {
  run(`npx tsx prisma/seed.ts`, { DATABASE_URL: TEST_URL });
}

function setup() {
  createDb();
  migrate();
  seed();
}

function reset() {
  dropDb();
  createDb();
  migrate();
  seed();
}

const cmd = process.argv[2];
switch (cmd) {
  case 'setup':
    setup();
    break;
  case 'reset':
    reset();
    break;
  case 'drop':
    dropDb();
    break;
  default:
    console.error(`Unknown command: ${cmd || '(none)'}`);
    console.error('Usage: node scripts/test-db.js <setup|reset|drop>');
    process.exit(1);
}

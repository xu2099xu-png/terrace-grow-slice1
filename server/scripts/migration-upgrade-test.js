#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const serverDir = path.resolve(__dirname, '..');
const prismaBin = path.join(serverDir, 'node_modules', '.bin', 'prisma');
const pgContainer = process.env.TEST_POSTGRES_CONTAINER || 'terrace-grow-postgres';
const pgUser = process.env.TEST_POSTGRES_USER || 'terrace';
const databaseName = 'terrace_grow_upgrade_test';

function readBaseUrl() {
  if (process.env.TEST_DATABASE_ADMIN_URL) return process.env.TEST_DATABASE_ADMIN_URL;
  for (const file of ['.env', '.env.example']) {
    const filename = path.join(serverDir, file);
    if (!fs.existsSync(filename)) continue;
    const line = fs.readFileSync(filename, 'utf8').split('\n')
      .find((entry) => entry.startsWith('DATABASE_URL='));
    if (line) return line.replace(/^DATABASE_URL=["']?|["']?\s*$/g, '');
  }
  throw new Error('TEST_DATABASE_ADMIN_URL or DATABASE_URL example is required');
}

function withDatabase(url, name) {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

function psql(database, sql, capture = false) {
  return execFileSync(
    'docker',
    ['exec', pgContainer, 'psql', '-U', pgUser, '-d', database, '-v', 'ON_ERROR_STOP=1', '-tAc', sql],
    { encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' },
  );
}

function migrate(schema, databaseUrl) {
  execFileSync(prismaBin, ['migrate', 'deploy', '--schema', schema], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}

const databaseUrl = withDatabase(readBaseUrl(), databaseName);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'terrace-slice2-upgrade-'));
const frozenSchema = path.join(temporary, 'schema.prisma');
const frozenMigrations = path.join(temporary, 'migrations');

try {
  psql('postgres', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${databaseName}' AND pid <> pg_backend_pid()`);
  psql('postgres', `DROP DATABASE IF EXISTS "${databaseName}"`);
  psql('postgres', `CREATE DATABASE "${databaseName}"`);

  fs.copyFileSync(path.join(serverDir, 'prisma', 'schema.prisma'), frozenSchema);
  fs.mkdirSync(frozenMigrations);
  fs.copyFileSync(
    path.join(serverDir, 'prisma', 'migrations', 'migration_lock.toml'),
    path.join(frozenMigrations, 'migration_lock.toml'),
  );
  for (const migration of [
    '20260808103335_init',
    '20260808124340_slice2_lifecycle_planting',
    '20260808130300_slice2_lifecycle_nulls_not_distinct',
  ]) {
    fs.cpSync(
      path.join(serverDir, 'prisma', 'migrations', migration),
      path.join(frozenMigrations, migration),
      { recursive: true },
    );
  }

  migrate(frozenSchema, databaseUrl);
  psql(databaseName, `
    INSERT INTO "User" ("id", "status") VALUES ('upgrade-user', 'active');
    INSERT INTO "TerraceProfile" (
      "id", "userId", "name", "cityCode", "sunExposureLevel",
      "sunHoursMin", "sunHoursMax", "sunSource", "sunConfidence",
      "rainExposed", "updatedAt"
    ) VALUES (
      'upgrade-terrace', 'upgrade-user', 'Upgrade Terrace', 'beijing', 'LONG',
      6, 8, 'self_reported', 'medium', false, CURRENT_TIMESTAMP
    );
    INSERT INTO "Crop" (
      "id", "name", "lifeType", "category", "difficulty", "familyUse",
      "yieldLevel", "containerFriendly", "recommendedStartMethod",
      "waterloggingSensitivity", "acidityNeed", "requiresAcidification",
      "reviewStatus", "updatedAt"
    ) VALUES (
      'upgrade-crop', 'Upgrade Crop', 'perennial', 'fruit', 1, 1, 1, true,
      'nursery_plant', 1, 'any', false, 'draft', CURRENT_TIMESTAMP
    );
    INSERT INTO "PlantingRecord" (
      "id", "userId", "terraceId", "cropId", "containerTypeId",
      "startMethod", "startDate", "status", "lifecycleTemplateId",
      "lifecycleVersion", "clientRequestId"
    ) VALUES (
      'upgrade-planting', 'upgrade-user', 'upgrade-terrace', 'upgrade-crop',
      'upgrade-container', 'nursery_plant', CURRENT_TIMESTAMP, 'active',
      'upgrade-template', 1, 'upgrade-request'
    );
  `);

  const currentSchema = path.join(serverDir, 'prisma', 'schema.prisma');
  migrate(currentSchema, databaseUrl);
  migrate(currentSchema, databaseUrl);

  const result = psql(databaseName, `
    SELECT
      (SELECT count(*) FROM "User" WHERE "id"='upgrade-user') || '|' ||
      (SELECT count(*) FROM "TerraceProfile" WHERE "id"='upgrade-terrace') || '|' ||
      (SELECT count(*) FROM "PlantingRecord" WHERE "id"='upgrade-planting') || '|' ||
      CASE WHEN to_regclass('public."SowingCalendar"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      (SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL);
  `, true).trim();
  if (result !== '1|1|1|1|4') {
    throw new Error(`Slice 2 upgrade verification failed: ${result}`);
  }
  console.log('Slice 2 frozen DB -> current: PASS (user|terrace|planting|table|migrations=1|1|1|1|4)');
} finally {
  try {
    psql('postgres', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${databaseName}' AND pid <> pg_backend_pid()`);
    psql('postgres', `DROP DATABASE IF EXISTS "${databaseName}"`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

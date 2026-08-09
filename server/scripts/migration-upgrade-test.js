#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const serverDir = path.resolve(__dirname, '..');
const prismaBin = path.join(serverDir, 'node_modules', '.bin', 'prisma');
const pgContainer = process.env.TEST_POSTGRES_CONTAINER || 'terrace-grow-postgres';
const pgUser = process.env.TEST_POSTGRES_USER || 'terrace';
const databaseName = 'terrace_grow_upgrade_test';
const SLICE4_CANDIDATE_SHA = '853852d1d1c118f2f6765b280c4f0ef3d3299a29';

const SLICE2_FROZEN_MIGRATIONS = [
  '20260808103335_init',
  '20260808124340_slice2_lifecycle_planting',
  '20260808130300_slice2_lifecycle_nulls_not_distinct',
];

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

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'inherit'],
  });
}

function currentMigrationCount() {
  return fs.readdirSync(path.join(serverDir, 'prisma', 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(serverDir, 'prisma', 'migrations', entry.name, 'migration.sql')))
    .length;
}

function prepareFrozenSchema(migrations) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'terrace-upgrade-'));
  const frozenSchema = path.join(temporary, 'schema.prisma');
  const frozenMigrations = path.join(temporary, 'migrations');
  fs.copyFileSync(path.join(serverDir, 'prisma', 'schema.prisma'), frozenSchema);
  fs.mkdirSync(frozenMigrations);
  fs.copyFileSync(
    path.join(serverDir, 'prisma', 'migrations', 'migration_lock.toml'),
    path.join(frozenMigrations, 'migration_lock.toml'),
  );
  for (const migration of migrations) {
    fs.cpSync(
      path.join(serverDir, 'prisma', 'migrations', migration),
      path.join(frozenMigrations, migration),
      { recursive: true },
    );
  }
  return { temporary, frozenSchema };
}

function prepareGitFrozenSchema(sha) {
  git(['cat-file', '-e', `${sha}^{commit}`]);
  const resolvedSha = git(['rev-parse', sha]).trim();
  if (resolvedSha !== sha) {
    throw new Error(`Slice 4 candidate SHA mismatch: expected ${sha}, got ${resolvedSha}`);
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'terrace-upgrade-git-'));
  const frozenSchema = path.join(temporary, 'schema.prisma');
  fs.writeFileSync(frozenSchema, git(['show', `${sha}:server/prisma/schema.prisma`]));

  const migrationFiles = git(['ls-tree', '-r', '--name-only', sha, 'server/prisma/migrations'])
    .split('\n')
    .filter(Boolean);
  if (!migrationFiles.some((file) => file.endsWith('/migration_lock.toml'))) {
    throw new Error(`Slice 4 candidate ${sha} has no Prisma migration lock`);
  }
  if (!migrationFiles.some((file) => file.endsWith('/migration.sql'))) {
    throw new Error(`Slice 4 candidate ${sha} has no Prisma migration SQL files`);
  }
  for (const file of migrationFiles) {
    const relative = file.replace(/^server\/prisma\//, '');
    const destination = path.join(temporary, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, git(['show', `${sha}:${file}`]));
  }
  return { temporary, frozenSchema };
}

function resetDatabase() {
  psql('postgres', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${databaseName}' AND pid <> pg_backend_pid()`);
  psql('postgres', `DROP DATABASE IF EXISTS "${databaseName}"`);
  psql('postgres', `CREATE DATABASE "${databaseName}"`);
}

function seedRepresentativeData() {
  psql(databaseName, `
    INSERT INTO "User" ("id", "status") VALUES ('upgrade-user', 'active');
    INSERT INTO "UserIdentity" (
      "id", "userId", "provider", "providerUid"
    ) VALUES (
      'upgrade-identity', 'upgrade-user', 'anonymous_device', 'upgrade-device'
    );
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
    INSERT INTO "SubstrateMaterial" (
      "id", "name", "waterRetention", "drainage", "aeration",
      "organicMatter", "nutrient", "acidifying", "functionGroup",
      "costLevel", "commonality", "reviewStatus"
    ) VALUES (
      'upgrade-material', 'Upgrade Material', 3, 3, 3,
      1, 1, false, 'base', 1, 1, 'draft'
    );
    INSERT INTO "UserMaterialInventory" (
      "id", "userId", "materialId", "level"
    ) VALUES (
      'upgrade-inventory', 'upgrade-user', 'upgrade-material', 'enough'
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
    INSERT INTO "PlantingEvent" (
      "id", "plantingId", "actionKey", "eventType", "note", "clientEventId"
    ) VALUES (
      'upgrade-event', 'upgrade-planting', 'upgrade-action', 'action_completed',
      'upgrade note', 'upgrade-event-client'
    );
  `);
}

function verifyResult(label) {
  const result = psql(databaseName, `
    SELECT
      (SELECT count(*) FROM "User" WHERE "id"='upgrade-user') || '|' ||
      (SELECT count(*) FROM "UserIdentity" WHERE "id"='upgrade-identity') || '|' ||
      (SELECT count(*) FROM "TerraceProfile" WHERE "id"='upgrade-terrace') || '|' ||
      (SELECT count(*) FROM "PlantingRecord" WHERE "id"='upgrade-planting') || '|' ||
      (SELECT count(*) FROM "PlantingEvent" WHERE "id"='upgrade-event') || '|' ||
      (SELECT count(*) FROM "UserMaterialInventory" WHERE "id"='upgrade-inventory') || '|' ||
      CASE WHEN to_regclass('public."SowingCalendar"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."AiExplanationCache"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."AiProviderUsageDay"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      (SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL);
  `, true).trim();
  const expected = `1|1|1|1|1|1|1|1|1|${currentMigrationCount()}`;
  if (result !== expected) {
    throw new Error(`${label} upgrade verification failed: ${result}`);
  }
  console.log(`${label}: PASS (user|identity|terrace|planting|event|inventory|sowing|ai_cache|ai_usage|migrations=${expected})`);
}

function verifyFreshResult(label) {
  const result = psql(databaseName, `
    SELECT
      CASE WHEN to_regclass('public."SowingCalendar"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."AiExplanationCache"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."AiProviderUsageDay"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      (SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL);
  `, true).trim();
  const expected = `1|1|1|${currentMigrationCount()}`;
  if (result !== expected) {
    throw new Error(`${label} verification failed: ${result}`);
  }
  console.log(`${label}: PASS (sowing|ai_cache|ai_usage|migrations=${expected})`);
}

function runUpgradeCase(label, frozenMigrations, databaseUrl) {
  const { temporary, frozenSchema } = prepareFrozenSchema(frozenMigrations);
  try {
    resetDatabase();
    migrate(frozenSchema, databaseUrl);
    seedRepresentativeData();
    const currentSchema = path.join(serverDir, 'prisma', 'schema.prisma');
    migrate(currentSchema, databaseUrl);
    migrate(currentSchema, databaseUrl);
    verifyResult(label);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function runGitUpgradeCase(label, sha, databaseUrl) {
  const { temporary, frozenSchema } = prepareGitFrozenSchema(sha);
  try {
    resetDatabase();
    migrate(frozenSchema, databaseUrl);
    seedRepresentativeData();
    const currentSchema = path.join(serverDir, 'prisma', 'schema.prisma');
    migrate(currentSchema, databaseUrl);
    migrate(currentSchema, databaseUrl);
    verifyResult(label);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function runFreshCurrentCase(databaseUrl) {
  resetDatabase();
  const currentSchema = path.join(serverDir, 'prisma', 'schema.prisma');
  migrate(currentSchema, databaseUrl);
  migrate(currentSchema, databaseUrl);
  verifyFreshResult('Fresh DB -> current');
}

const databaseUrl = withDatabase(readBaseUrl(), databaseName);

try {
  runFreshCurrentCase(databaseUrl);
  runUpgradeCase('Slice 2 frozen DB -> current', SLICE2_FROZEN_MIGRATIONS, databaseUrl);
  runGitUpgradeCase('Slice 4 candidate DB -> current', SLICE4_CANDIDATE_SHA, databaseUrl);
} finally {
  psql('postgres', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${databaseName}' AND pid <> pg_backend_pid()`);
  psql('postgres', `DROP DATABASE IF EXISTS "${databaseName}"`);
}

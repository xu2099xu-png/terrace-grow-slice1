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
const SLICE5_FROZEN_SHA = '5b91de6af0194fdb437fb858834fd5d7c47833d4';
const LEGACY_CITY_REGION_MAPPINGS = {
  beijing: '110000',
  tianjin: '120000',
  shanghai: '310000',
  hangzhou: '330100',
  nanjing: '320100',
  suzhou: '320500',
  ningbo: '330200',
  hefei: '340100',
  wuxi: '320200',
  guangzhou: '440100',
  shenzhen: '440300',
  fuzhou: '350100',
  xiamen: '350200',
  nanning: '450100',
  shijiazhuang: '130100',
  jinan: '370100',
  zhengzhou: '410100',
};

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
    throw new Error(`Git baseline SHA mismatch: expected ${sha}, got ${resolvedSha}`);
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'terrace-upgrade-git-'));
  const frozenSchema = path.join(temporary, 'schema.prisma');
  fs.writeFileSync(frozenSchema, git(['show', `${sha}:server/prisma/schema.prisma`]));

  const migrationFiles = git(['ls-tree', '-r', '--name-only', sha, 'server/prisma/migrations'])
    .split('\n')
    .filter(Boolean);
  if (!migrationFiles.some((file) => file.endsWith('/migration_lock.toml'))) {
    throw new Error(`Git baseline ${sha} has no Prisma migration lock`);
  }
  if (!migrationFiles.some((file) => file.endsWith('/migration.sql'))) {
    throw new Error(`Git baseline ${sha} has no Prisma migration SQL files`);
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
  const terraceRows = Object.keys(LEGACY_CITY_REGION_MAPPINGS).map((cityCode) => {
    const terraceId = cityCode === 'beijing' ? 'upgrade-terrace' : `upgrade-terrace-${cityCode}`;
    return `(
      '${terraceId}', 'upgrade-user', 'Upgrade ${cityCode}', '${cityCode}', 'LONG',
      6, 8, 'self_reported', 'medium', false, CURRENT_TIMESTAMP
    )`;
  }).join(',\n');

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
    ) VALUES ${terraceRows};
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

function seedAiRepresentativeData() {
  psql(databaseName, `
    INSERT INTO "AiExplanationCache" (
      "id", "userId", "cacheKeyHash", "responseJson", "provider", "model",
      "promptVersion", "createdAt", "expiresAt"
    ) VALUES (
      'upgrade-ai-cache', 'upgrade-user', 'upgrade-ai-cache-key',
      '{"summary":"slice5 upgrade cache"}'::jsonb, 'mock', 'slice5-model',
      'slice5-upgrade-test-v1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day'
    );
    INSERT INTO "AiProviderUsageDay" (
      "id", "userId", "day", "provider", "callCount", "updatedAt"
    ) VALUES (
      'upgrade-ai-usage', 'upgrade-user', '2026-08-10', 'mock', 3, CURRENT_TIMESTAMP
    );
  `);
}

function verifyResult(label) {
  const result = psql(databaseName, `
    SELECT
      (SELECT count(*) FROM "User" WHERE "id"='upgrade-user') || '|' ||
      (SELECT count(*) FROM "UserIdentity" WHERE "id"='upgrade-identity') || '|' ||
      (SELECT count(*) FROM "TerraceProfile" WHERE "id" LIKE 'upgrade-terrace%') || '|' ||
      (SELECT count(*) FROM "PlantingRecord" WHERE "id"='upgrade-planting') || '|' ||
      (SELECT count(*) FROM "PlantingEvent" WHERE "id"='upgrade-event') || '|' ||
      (SELECT count(*) FROM "UserMaterialInventory" WHERE "id"='upgrade-inventory') || '|' ||
      CASE WHEN to_regclass('public."SowingCalendar"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."AiExplanationCache"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."AiProviderUsageDay"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."Region"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."PopularCity"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."RegionClimateMapping"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."ClimateAnchor"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."WeatherCache"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."CalendarContextCache"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      (SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL);
  `, true).trim();
  const expected = `1|1|${Object.keys(LEGACY_CITY_REGION_MAPPINGS).length}|1|1|1|1|1|1|1|1|1|1|1|1|${currentMigrationCount()}`;
  if (result !== expected) {
    throw new Error(`${label} upgrade verification failed: ${result}`);
  }
  verifyLegacyBackfill(label);
  console.log(`${label}: PASS (user|identity|terraces|planting|event|inventory|sowing|ai_cache|ai_usage|region|popular|mapping|anchor|weather_cache|calendar_cache|migrations=${expected})`);
}

function verifyFreshResult(label) {
  const result = psql(databaseName, `
    SELECT
      CASE WHEN to_regclass('public."SowingCalendar"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."AiExplanationCache"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."AiProviderUsageDay"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."Region"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."PopularCity"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."RegionClimateMapping"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."ClimateAnchor"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."WeatherCache"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      CASE WHEN to_regclass('public."CalendarContextCache"') IS NOT NULL THEN '1' ELSE '0' END || '|' ||
      (SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL);
  `, true).trim();
  const expected = `1|1|1|1|1|1|1|1|1|${currentMigrationCount()}`;
  if (result !== expected) {
    throw new Error(`${label} verification failed: ${result}`);
  }
  console.log(`${label}: PASS (sowing|ai_cache|ai_usage|region|popular|mapping|anchor|weather_cache|calendar_cache|migrations=${expected})`);
}

function verifyLegacyBackfill(label) {
  const result = psql(databaseName, `
    SELECT "cityCode" || ':' || COALESCE("regionAdminCode", '<null>') || ':' || "needsDistrictConfirmation"
    FROM "TerraceProfile"
    WHERE "id" LIKE 'upgrade-terrace%'
    ORDER BY "cityCode";
  `, true).trim().split('\n').filter(Boolean).map((line) => line.trim());
  const expected = Object.entries(LEGACY_CITY_REGION_MAPPINGS)
    .map(([cityCode, regionAdminCode]) => `${cityCode}:${regionAdminCode}:true`)
    .sort();
  if (result.join('|') !== expected.join('|')) {
    throw new Error(`${label} legacy cityCode backfill failed: ${result.join('|')}`);
  }
  console.log(`${label}: PASS legacy cityCode backfill (${expected.length} mappings)`);
}

function verifyAiRepresentativeData(label) {
  const result = psql(databaseName, `
    SELECT
      (SELECT count(*) FROM "AiExplanationCache" WHERE "id"='upgrade-ai-cache'
        AND "userId"='upgrade-user'
        AND "cacheKeyHash"='upgrade-ai-cache-key'
        AND "provider"='mock'
        AND "model"='slice5-model'
        AND "promptVersion"='slice5-upgrade-test-v1'
        AND "responseJson"->>'summary'='slice5 upgrade cache') || '|' ||
      (SELECT count(*) FROM "AiProviderUsageDay" WHERE "id"='upgrade-ai-usage'
        AND "userId"='upgrade-user'
        AND "day"='2026-08-10'
        AND "provider"='mock'
        AND "callCount"=3);
  `, true).trim();
  if (result !== '1|1') {
    throw new Error(`${label} Slice 5 AI row preservation failed: ${result}`);
  }
  console.log(`${label}: PASS Slice 5 AI cache/provider usage preservation`);
}

function verifyMigrationCount(label, expected) {
  const result = Number(psql(databaseName, 'SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL;', true).trim());
  if (result !== expected) {
    throw new Error(`${label} migration count failed: expected ${expected}, got ${result}`);
  }
  console.log(`${label}: PASS baseline migrations=${expected}`);
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

function runGitUpgradeCase(label, sha, databaseUrl, options = {}) {
  const { temporary, frozenSchema } = prepareGitFrozenSchema(sha);
  try {
    resetDatabase();
    migrate(frozenSchema, databaseUrl);
    if (options.expectedBaselineMigrationCount) {
      verifyMigrationCount(`${label} baseline`, options.expectedBaselineMigrationCount);
    }
    seedRepresentativeData();
    if (options.seedAiRows) seedAiRepresentativeData();
    const currentSchema = path.join(serverDir, 'prisma', 'schema.prisma');
    migrate(currentSchema, databaseUrl);
    migrate(currentSchema, databaseUrl);
    verifyResult(label);
    if (options.verifyAiRows) verifyAiRepresentativeData(label);
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
  runGitUpgradeCase('Slice 5 frozen DB -> current', SLICE5_FROZEN_SHA, databaseUrl, {
    expectedBaselineMigrationCount: currentMigrationCount() - 1,
    seedAiRows: true,
    verifyAiRows: true,
  });
} finally {
  psql('postgres', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${databaseName}' AND pid <> pg_backend_pid()`);
  psql('postgres', `DROP DATABASE IF EXISTS "${databaseName}"`);
}

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Tests always run against the isolated test database, never the dev DB.
const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://terrace:terrace@localhost:5433/terrace_grow_test?schema=public';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
    // integration/governance suites share the same test DB and mutate rows;
    // run files sequentially to avoid cross-file interference.
    fileParallelism: false,
    env: {
      DATABASE_URL: testDbUrl,
      APP_ENV: 'development',
      ALLOW_DRAFT_FIXTURES: 'true',
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});

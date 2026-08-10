import { defineConfig } from '@playwright/test';

const e2eApiPort = process.env.E2E_API_PORT || '3000';
const e2eH5Port = process.env.E2E_H5_PORT || '5173';

/**
 * Slice 2 browser E2E (S2-E2E-01/02).
 *
 * Topology:
 *   H5 (vite dev, :5173, /api proxied to :3000)
 *   server (NestJS, :3000, DATABASE_URL -> test DB)
 *
 * `test:browser` must run AFTER `db:test:setup` (test DB seeded). The
 * webServer array starts both processes; backend uses the isolated test DB.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${e2eH5Port}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'sh scripts/browser-e2e-server.sh',
    url: `http://127.0.0.1:${e2eApiPort}/api/crops?life_type=perennial`,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
});

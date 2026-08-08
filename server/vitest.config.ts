import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});

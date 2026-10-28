import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      // Globs resolve from the repo root for browser-mode projects but from the project root for node-mode ones,
      // so deploy/cloudflare's are written as smoke/** and scripts/**, and api's as src/**.
      include: ['web/src/**', 'smoke/**', 'scripts/**', 'src/**'],
      exclude: ['web/src/test/**', 'smoke/local.ts', 'smoke/deployed.ts', 'smoke/report.ts', 'scripts/assemble.ts', 'src/worker.ts'],
    },
    projects: [
      'web',
      'api',
      'deploy/cloudflare',
      {
        test: {
          name: 'tooling',
          include: ['*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});

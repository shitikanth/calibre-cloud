import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      // Globs resolve from the repo root for browser-mode projects but from the project root for node-mode ones,
      // so deploy/cloudflare's are written as smoke/** and scripts/**.
      include: ['web/src/**', 'smoke/**', 'scripts/**'],
      // The deploy entry points are CLI mains that the CI build and smoke steps run, not Vitest.
      exclude: ['web/src/test/**', 'smoke/local.ts', 'smoke/deployed.ts', 'smoke/report.ts', 'scripts/assemble.ts'],
    },
    projects: [
      'web',
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

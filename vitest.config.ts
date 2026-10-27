import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Globs resolve from the repo root for browser-mode projects but from the project root for node-mode ones,
      // so deploy/cloudflare's are written as smoke/** and scripts/**.
      include: ['web/src/**', 'smoke/**', 'scripts/**'],
      exclude: ['web/src/test/**'],
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

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Browser-mode files match against the repo root, node-mode files against their project's root.
      // `deploy/cloudflare/smoke/**` reports nothing for the deploy project.
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

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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

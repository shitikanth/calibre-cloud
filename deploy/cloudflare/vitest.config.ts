import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'deploy-cloudflare',
    environment: 'node',
    testTimeout: 30_000,
  },
});

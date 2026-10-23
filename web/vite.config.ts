import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';

const megaSmokeLink = process.env.CI ? '' : (loadEnv('test', decodeURIComponent(new URL('..', import.meta.url).pathname), 'MEGA_SMOKE_').MEGA_SMOKE_LINK ?? '');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  optimizeDeps: {
    include: [
      'react',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      '@tanstack/react-router',
      '@tanstack/react-query',
      'vitest-browser-react',
      'megajs',
    ],
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  test: {
    name: 'web',
    setupFiles: ['./src/test/setup.ts'],
    provide: { megaSmokeLink },
    expect: { poll: { timeout: 5_000 } },
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});

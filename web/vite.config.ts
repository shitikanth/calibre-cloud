import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';

const megaSmokeLink = process.env.CI ? '' : (loadEnv('test', decodeURIComponent(new URL('..', import.meta.url).pathname), 'MEGA_SMOKE_').MEGA_SMOKE_LINK ?? '');

function pdfjsWasm(): Plugin {
  const wasmDir = fileURLToPath(new URL('./node_modules/pdfjs-dist/wasm/', import.meta.url));
  return {
    name: 'pdfjs-wasm',
    apply: 'build',
    generateBundle() {
      for (const name of readdirSync(wasmDir)) {
        this.emitFile({ type: 'asset', fileName: `pdfjs/wasm/${name}`, source: readFileSync(join(wasmDir, name)) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsWasm()],
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
      'pdfjs-dist/legacy/build/pdf.mjs',
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

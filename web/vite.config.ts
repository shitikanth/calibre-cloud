import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import type { BrowserCommand } from 'vitest/node';
import { shellPaths } from './src/pwa/app-shell.ts';

const emulateReducedMotion: BrowserCommand<[reducedMotion: 'reduce' | null]> = async ({ page }, reducedMotion) => {
  await page.emulateMedia({ reducedMotion });
};

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

function appShellServiceWorker(): Plugin {
  const placeholder = '__APP_SHELL__';
  let outDir = '';
  return {
    name: 'app-shell-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    buildStart() {
      this.emitFile({ type: 'chunk', id: fileURLToPath(new URL('./src/pwa/sw.ts', import.meta.url)), fileName: 'sw.js' });
    },
    generateBundle(_, bundle) {
      const sw = bundle['sw.js'];
      if (sw?.type !== 'chunk' || sw.imports.length > 0 || sw.dynamicImports.length > 0)
        this.error('sw.js must be one chunk with no imports: a service worker that shares code with the app cannot load as a classic script');
    },
    closeBundle() {
      const built = readdirSync(outDir, { recursive: true, encoding: 'utf8' })
        .filter((file) => statSync(join(outDir, file)).isFile())
        .map((file) => file.split(sep).join('/'))
        .sort();
      const paths = shellPaths(built);
      const version = createHash('sha256');
      for (const path of paths) version.update(path).update(readFileSync(join(outDir, path === '/' ? 'index.html' : path.slice(1))));
      const swFile = join(outDir, 'sw.js');
      const code = readFileSync(swFile, 'utf8');
      if (code.split(placeholder).length !== 2) this.error(`sw.js must name ${placeholder} exactly once`);
      writeFileSync(swFile, code.replace(placeholder, JSON.stringify({ version: version.digest('hex').slice(0, 16), paths })));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsWasm(), appShellServiceWorker()],
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
      commands: { emulateReducedMotion },
    },
  },
});

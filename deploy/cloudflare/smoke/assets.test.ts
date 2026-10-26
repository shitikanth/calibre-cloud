import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { checkAssets, emittedAssets } from './assets.ts';

const immutable = 'public, max-age=31536000, immutable';

const files: Record<string, { type: string; cacheControl?: string }> = {
  '/assets/pdf.worker.min-abc123.mjs': { type: 'text/javascript', cacheControl: immutable },
  '/assets/revalidated-def456.js': { type: 'text/javascript', cacheControl: 'public, max-age=0, must-revalidate' },
  '/assets/uncached-ghi789.js': { type: 'text/javascript' },
  '/pdfjs/wasm/openjpeg.wasm': { type: 'application/wasm' },
  '/pdfjs/wasm/quickjs-eval.js': { type: 'Application/JavaScript; charset=utf-8' },
  '/pdfjs/wasm/mislabelled.wasm': { type: 'application/octet-stream' },
  '/pdfjs/wasm/html.js': { type: 'text/html' },
};

let server: Server;
let origin: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const file = files[req.url ?? ''];
    res.writeHead(file ? 200 : 404, { 'content-type': file?.type ?? 'text/html', ...(file?.cacheControl ? { 'cache-control': file.cacheControl } : {}) });
    res.end(file ? 'bytes' : 'not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

test('passes assets served with 200 and the right content type', async () => {
  const assets = ['/assets/pdf.worker.min-abc123.mjs', '/pdfjs/wasm/openjpeg.wasm', '/pdfjs/wasm/quickjs-eval.js'];
  expect(await checkAssets(origin, assets)).toEqual([]);
});

test('reports a missing asset', async () => {
  expect(await checkAssets(origin, ['/pdfjs/wasm/gone.wasm'])).toEqual(['/pdfjs/wasm/gone.wasm: HTTP 404']);
});

test('reports a hashed /assets/ file served without an immutable Cache-Control', async () => {
  expect(await checkAssets(origin, ['/assets/revalidated-def456.js', '/assets/uncached-ghi789.js'])).toEqual([
    `/assets/revalidated-def456.js: cache-control public, max-age=0, must-revalidate, expected ${immutable}`,
    `/assets/uncached-ghi789.js: cache-control (none), expected ${immutable}`,
  ]);
});

test('reports an asset served with the wrong content type', async () => {
  expect(await checkAssets(origin, ['/pdfjs/wasm/mislabelled.wasm', '/pdfjs/wasm/html.js'])).toEqual([
    '/pdfjs/wasm/mislabelled.wasm: content-type application/octet-stream, expected application/wasm',
    '/pdfjs/wasm/html.js: content-type text/html, expected text/javascript or application/javascript',
  ]);
});

test('lists the pdf.js worker and wasm files a build emitted', () => {
  const dist = mkdtempSync(join(tmpdir(), 'smoke-dist-'));
  mkdirSync(join(dist, 'assets'));
  mkdirSync(join(dist, 'pdfjs/wasm'), { recursive: true });
  for (const name of ['assets/pdf.worker.min-Dkey6ZUl.mjs', 'assets/index-abc.js', 'pdfjs/wasm/openjpeg.wasm', 'pdfjs/wasm/quickjs-eval.js', 'pdfjs/wasm/LICENSE_OPENJPEG']) {
    writeFileSync(join(dist, name), '');
  }
  expect(emittedAssets(dist)).toEqual(['/assets/pdf.worker.min-Dkey6ZUl.mjs', '/pdfjs/wasm/openjpeg.wasm', '/pdfjs/wasm/quickjs-eval.js']);
});

test('fails clearly when there is no build', () => {
  expect(() => emittedAssets(join(tmpdir(), 'smoke-no-dist'))).toThrow(/run pnpm build first/);
});

test('fails clearly when the build has no wasm files', () => {
  const dist = mkdtempSync(join(tmpdir(), 'smoke-dist-'));
  mkdirSync(join(dist, 'assets'));
  mkdirSync(join(dist, 'pdfjs/wasm'), { recursive: true });
  writeFileSync(join(dist, 'assets/pdf.worker.min-Dkey6ZUl.mjs'), '');
  writeFileSync(join(dist, 'pdfjs/wasm/LICENSE_OPENJPEG'), '');
  expect(() => emittedAssets(dist)).toThrow(/no pdf\.js wasm/);
});

test('fails clearly when the build has no pdf.js worker', () => {
  const dist = mkdtempSync(join(tmpdir(), 'smoke-dist-'));
  mkdirSync(join(dist, 'assets'));
  mkdirSync(join(dist, 'pdfjs/wasm'), { recursive: true });
  expect(() => emittedAssets(dist)).toThrow(/pdf\.worker/);
});

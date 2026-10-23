import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { checkAssets, emittedAssets } from './assets.ts';

const files: Record<string, string> = {
  '/assets/pdf.worker.min-abc123.mjs': 'text/javascript',
  '/pdfjs/wasm/openjpeg.wasm': 'application/wasm',
  '/pdfjs/wasm/quickjs-eval.js': 'Application/JavaScript; charset=utf-8',
  '/pdfjs/wasm/mislabelled.wasm': 'application/octet-stream',
  '/pdfjs/wasm/html.js': 'text/html',
};

let server: Server;
let origin: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const type = files[req.url ?? ''];
    res.writeHead(type ? 200 : 404, { 'content-type': type ?? 'text/html' });
    res.end(type ? 'bytes' : 'not found');
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

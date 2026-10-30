import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { checkInstallableOffline } from './pwa.ts';

const csp = readFileSync(new URL('../_headers', import.meta.url), 'utf8')
  .split('\n')
  .find((line) => line.trim().startsWith('Content-Security-Policy:'))!
  .replace(/^\s*Content-Security-Policy:\s*/, '');

const icon = (name: string) => readFileSync(new URL(`../../../web/public/icons/${name}`, import.meta.url));

const manifest = JSON.stringify({
  name: 'fixture',
  start_url: '/',
  display: 'standalone',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
});

const fromCache = 'caches.match(key).then((cached) => cached ?? fetch(event.request))';

const serviceWorker = (precache: string[], respond = fromCache) => `
  self.addEventListener('install', (event) => event.waitUntil(caches.open('shell').then((cache) => cache.addAll(${JSON.stringify(precache)}))));
  self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/api/')) return;
    const key = event.request.mode === 'navigate' ? '/' : event.request;
    event.respondWith(${respond});
  });
`;

type Site = Record<string, { body: string | Buffer; type?: string; headers?: Record<string, string> } | undefined>;

function installableSite(): Site {
  return {
    '/': {
      body: '<link rel="manifest" href="/app.webmanifest"><link rel="apple-touch-icon" href="/touch.png"><div id="root"></div><script src="/app.js"></script>',
    },
    '/app.js': {
      type: 'text/javascript',
      body: "document.getElementById('root').textContent = 'hello'; navigator.serviceWorker.register('/sw.js');",
    },
    '/sw.js': { type: 'text/javascript', body: serviceWorker(['/', '/app.js']), headers: { 'cache-control': 'no-cache' } },
    '/app.webmanifest': { type: 'application/manifest+json', body: manifest },
    '/icon-192.png': { type: 'image/png', body: icon('icon-192.png') },
    '/icon-512.png': { type: 'image/png', body: icon('icon-512.png') },
    '/touch.png': { type: 'image/png', body: icon('apple-touch-icon.png') },
    '/api/auth/token': { type: 'application/json', body: '{}' },
  };
}

let site: Site;
let server: Server;
let origin: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    const file = site[path] ?? (path.includes('.') ? undefined : site['/']);
    res.writeHead(file ? 200 : 404, { 'content-type': file?.type ?? 'text/html', 'content-security-policy': csp, ...file?.headers });
    res.end(file?.body ?? 'not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  site = installableSite();
});

afterAll(() => {
  server.close();
});

test('passes an installable app whose service worker opens it offline', async () => {
  expect(await checkInstallableOffline(origin, ['/', '/books/1'])).toEqual([]);
});

test('reports an app the browser cannot install', async () => {
  site['/'] = { body: site['/']!.body.toString().replace('<link rel="manifest" href="/app.webmanifest">', '') };

  expect((await checkInstallableOffline(origin, ['/'])).join('\n')).toMatch(/^manifest: .*/m);
});

test('reports a service worker script served with long-lived caching', async () => {
  site['/sw.js'] = { ...site['/sw.js']!, headers: { 'cache-control': 'public, max-age=31536000, immutable' } };

  expect(await checkInstallableOffline(origin, ['/'])).toContain('/sw.js: cache-control public, max-age=31536000, immutable, expected no-cache');
});

test('reports a service worker that caches an /api/ response', async () => {
  site['/sw.js'] = { ...site['/sw.js']!, body: serviceWorker(['/', '/app.js', '/api/auth/token']) };

  expect(await checkInstallableOffline(origin, ['/'])).toContain(`service worker cache shell holds ${origin}/api/auth/token`);
});

test('reports a shell served offline without its CSP', async () => {
  const withoutHeaders = "caches.match('/').then((cached) => cached.text()).then((body) => new Response(body, { headers: { 'content-type': 'text/html' } }))";
  site['/sw.js'] = { ...site['/sw.js']!, body: serviceWorker(['/', '/app.js'], `event.request.mode === 'navigate' ? ${withoutHeaders} : ${fromCache}`) };

  expect(await checkInstallableOffline(origin, ['/books/1'])).toContain('/books/1 offline: no Content-Security-Policy header');
});

test('reports an app that does not open offline', async () => {
  site['/app.js'] = { type: 'text/javascript', body: "document.getElementById('root').textContent = 'hello';" };

  const problems = await checkInstallableOffline(origin, ['/']);

  expect(problems).toContain('no service worker took control of /');
  expect(problems).toContainEqual(expect.stringMatching(/^\/ offline: /));
});

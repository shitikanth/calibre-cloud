import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { checkPublicPages } from './pages.ts';

const csp = readFileSync(new URL('../_headers', import.meta.url), 'utf8')
  .split('\n')
  .find((line) => line.trim().startsWith('Content-Security-Policy:'))!
  .replace(/^\s*Content-Security-Policy:\s*/, '');

const app = '<div id="root"></div><script src="/app.js"></script>';

const healthy: Record<string, string> = {
  '/about': '<h1>calibre-cloud</h1><a href="/privacy">Privacy</a> <a href="/terms">Terms</a>',
  '/privacy': '<h1>Privacy policy</h1>',
  '/terms': '<h1>Terms of service</h1>',
};

type Served = string | number;

let pages: Record<string, Served>;
let headers: Record<string, string>;
let server: Server;
let origin: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/app.js') {
      res
        .writeHead(200, { 'content-type': 'text/javascript' })
        .end("document.getElementById('root').textContent = 'app';");
      return;
    }
    const page = pages[req.url ?? ''] ?? app;
    if (typeof page === 'number') res.writeHead(page).end();
    else res.writeHead(200, { 'content-type': 'text/html', ...headers }).end(page);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

function serve(
  overrides: Record<string, Served | undefined>,
  responseHeaders: Record<string, string> = { 'content-security-policy': csp },
) {
  pages = Object.fromEntries(
    Object.entries({ ...healthy, ...overrides }).filter((entry): entry is [string, Served] => entry[1] !== undefined),
  );
  headers = responseHeaders;
}

test('passes a home page that links to the privacy policy and terms, both served as pages', async () => {
  serve({});
  expect(await checkPublicPages(origin)).toEqual([]);
});

test('reports a page the SPA fallback answers with the app', async () => {
  serve({ '/terms': undefined });
  expect(await checkPublicPages(origin)).toEqual(['/terms: serves the app, not the page']);
});

test('reports a page that does not load', async () => {
  serve({ '/privacy': 404 });
  expect(await checkPublicPages(origin)).toContain('/privacy: HTTP 404');
});

test('reports a page whose content needs JavaScript', async () => {
  serve({
    '/privacy': '<main></main><script>document.querySelector("main").innerHTML = "<h1>Privacy policy</h1>"</script>',
  });
  expect(await checkPublicPages(origin)).toEqual(['/privacy: shows no heading without JavaScript']);
});

test('reports a home page missing a link to the privacy policy or the terms', async () => {
  serve({ '/about': '<h1>calibre-cloud</h1><a href="/terms">Terms</a>' });
  expect(await checkPublicPages(origin)).toEqual(['/about: no link to /privacy']);
});

test('reports pages served without the expected CSP', async () => {
  serve({}, {});
  expect(await checkPublicPages(origin)).toEqual([
    '/about: no Content-Security-Policy header',
    '/privacy: no Content-Security-Policy header',
    '/terms: no Content-Security-Policy header',
  ]);
  serve({}, { 'content-security-policy': `${csp}; sandbox` });
  expect(await checkPublicPages(origin, [{ path: '/terms' }])).toEqual(['/terms: CSP sandbox is not expected']);
});

test('reports a stylesheet the CSP blocks', async () => {
  serve({ '/terms': '<link rel="stylesheet" href="https://example.com/x.css"><h1>Terms of service</h1>' });
  expect((await checkPublicPages(origin)).join('\n')).toMatch(/^\/terms: .*Content Security Policy/);
});

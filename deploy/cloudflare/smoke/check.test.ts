import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { smokeCheck } from './check.ts';

const csp =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' blob:; img-src 'self' blob: data:; font-src 'self' blob: data:; media-src 'self' blob:; frame-src blob:; connect-src 'self' https://g.api.mega.co.nz https://*.userstorage.mega.co.nz; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

const pages: Record<string, { body: string; type?: string; csp?: string }> = {
  '/clean': { body: '<div id="root"></div><script src="/app.js"></script>' },
  '/app.js': { type: 'text/javascript', body: "document.getElementById('root').textContent = 'hello';" },
  '/inline-script': { body: '<div id="root">hi</div><script>console.log("inline")</script>' },
  '/throws': { body: '<div id="root">hi</div><script src="/throw.js"></script>' },
  '/throw.js': { type: 'text/javascript', body: "throw new TypeError('boom');" },
  '/blank': { body: '<div id="root"></div>' },
  '/no-csp': { body: '<div id="root">hi</div>', csp: '' },
  '/loose-csp': { body: '<div id="root">hi</div>', csp: "default-src 'self'; script-src 'self' 'unsafe-eval'; sandbox" },
};

let server: Server;
let origin: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const page = pages[req.url ?? ''];
    res.writeHead(page ? 200 : 404, {
      'content-type': page?.type ?? 'text/html',
      ...(page?.csp === '' ? {} : { 'content-security-policy': page?.csp ?? csp }),
    });
    res.end(page?.body ?? 'not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

test('passes a page that renders under its CSP without errors', async () => {
  expect(await smokeCheck(origin, ['/clean'])).toEqual([]);
});

test('reports a CSP violation', async () => {
  const problems = await smokeCheck(origin, ['/inline-script']);
  expect(problems.join('\n')).toMatch(/\/inline-script: .*Content Security Policy/);
});

test('reports an uncaught error', async () => {
  expect(await smokeCheck(origin, ['/throws'])).toContainEqual(expect.stringMatching(/^\/throws: .*TypeError: boom/));
});

test('reports a page that does not load', async () => {
  expect(await smokeCheck(origin, ['/missing'])).toContainEqual(expect.stringMatching(/^\/missing: HTTP 404/));
});

test('reports an app that renders nothing', async () => {
  expect(await smokeCheck(origin, ['/blank'])).toEqual(['/blank: #root is empty']);
});

test('reports a page served without a CSP', async () => {
  expect(await smokeCheck(origin, ['/no-csp'])).toEqual(['/no-csp: no Content-Security-Policy header']);
});

test('reports every directive that differs from the expected CSP', async () => {
  const problems = await smokeCheck(origin, ['/loose-csp']);
  expect(problems).toContain("/loose-csp: CSP script-src is 'self' 'unsafe-eval', expected 'self' 'wasm-unsafe-eval'");
  expect(problems).toContain('/loose-csp: CSP style-src is missing');
  expect(problems).toContain('/loose-csp: CSP sandbox is not expected');
  expect(problems).not.toContain('/loose-csp: CSP default-src is missing');
});

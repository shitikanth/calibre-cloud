import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { checkAuthRoutes } from './auth.ts';

type Route = (req: IncomingMessage, res: ServerResponse, origin: string) => void;

const healthy: Record<string, Route> = {
  'GET /api/auth/google/start?return=%2F': (_req, res, origin) => {
    const location = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    location.searchParams.set('redirect_uri', `${origin}/api/auth/google/callback`);
    res.writeHead(302, { location: location.href, 'set-cookie': 'signin_state=sealed; Path=/api/auth' }).end();
  },
  'POST /api/auth/refresh': (req, res, origin) => {
    if (req.headers.origin !== origin || req.headers.cookie) res.writeHead(403).end();
    else res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"reconnect"}');
  },
};

let routes: Record<string, Route>;
let server: Server;
let origin: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const route = routes[`${req.method} ${req.url}`];
    if (route) route(req, res, origin);
    else res.writeHead(200, { 'content-type': 'text/html' }).end('<div id="root"></div>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

test('passes when sign-in redirects to Google and refresh without a sign-in asks to reconnect', async () => {
  routes = healthy;
  expect(await checkAuthRoutes(origin)).toEqual([]);
});

test('reports a start route that the SPA fallback answers instead of the Worker', async () => {
  routes = Object.fromEntries(Object.entries(healthy).filter(([route]) => !route.startsWith('GET ')));
  expect(await checkAuthRoutes(origin)).toEqual(['GET /api/auth/google/start: HTTP 200, expected a 302 to Google']);
});

test('reports a start route that fails for want of configuration', async () => {
  routes = {
    ...healthy,
    'GET /api/auth/google/start?return=%2F': (_req, res) =>
      res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"not-configured","missing":["cookieKey"]}'),
  };
  expect(await checkAuthRoutes(origin)).toEqual([
    'GET /api/auth/google/start: HTTP 500, expected a 302 to Google: {"error":"not-configured","missing":["cookieKey"]}',
  ]);
});

test('reports a redirect elsewhere, with the wrong callback, or without a state cookie', async () => {
  routes = {
    ...healthy,
    'GET /api/auth/google/start?return=%2F': (_req, res) =>
      res.writeHead(302, { location: 'https://example.com/?redirect_uri=https%3A%2F%2Fother.example%2Fcb' }).end(),
  };
  expect(await checkAuthRoutes(origin)).toEqual([
    'GET /api/auth/google/start: redirects to https://example.com, expected https://accounts.google.com',
    `GET /api/auth/google/start: redirect_uri is https://other.example/cb, expected ${origin}/api/auth/google/callback`,
    'GET /api/auth/google/start: sets no signin_state cookie',
  ]);
});

test('reports a refresh that does not ask to reconnect', async () => {
  routes = {
    ...healthy,
    'POST /api/auth/refresh': (_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<div id="root"></div>'),
  };
  expect(await checkAuthRoutes(origin)).toEqual([
    'POST /api/auth/refresh: HTTP 200 <div id="root"></div>, expected 401 {"error":"reconnect"}',
  ]);
});

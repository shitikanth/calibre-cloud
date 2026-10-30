import { expect, test } from 'vitest';
import { routeRequest, shellPaths } from './app-shell.ts';

const origin = 'https://app.example';
const precached = new Set(['/', '/assets/index-abc123.js', '/pdfjs/wasm/openjpeg.wasm', '/manifest.webmanifest']);

function route(url: string, mode: RequestMode = 'no-cors', method = 'GET') {
  return routeRequest({ url, mode, method }, origin, precached);
}

test.each(['/', '/books/1', '/books/1/read/EPUB', '/smoke/deep-link', '/?code=x'])('an app navigation to %s gets the cached shell', (path) => {
  expect(route(`${origin}${path}`, 'navigate')).toBe('shell');
});

test.each(['/assets/index-abc123.js', '/pdfjs/wasm/openjpeg.wasm', '/manifest.webmanifest'])('%s comes from the precache', (path) => {
  expect(route(`${origin}${path}`, 'cors')).toBe('precached');
});

test.each([
  ['an /api/ navigation', `${origin}/api/auth/callback?code=x`, 'navigate'],
  ['an /api/ fetch', `${origin}/api/auth/token`, 'cors'],
  ['the about page', `${origin}/about`, 'navigate'],
  ['the privacy policy', `${origin}/privacy`, 'navigate'],
  ['the terms', `${origin}/terms`, 'navigate'],
  ['the privacy policy file', `${origin}/privacy.html`, 'navigate'],
  ['the public pages stylesheet', `${origin}/pages.css`, 'no-cors'],
  ['MEGA', 'https://g.api.mega.co.nz/cs?id=1', 'cors'],
  ['MEGA storage', 'https://gfs270n123.userstorage.mega.co.nz/dl/abc', 'cors'],
  ['Google APIs', 'https://www.googleapis.com/upload/files/abc', 'cors'],
  ['Dropbox', 'https://content.dropboxapi.com/2/files/download', 'cors'],
  ['a same-origin file outside the shell', `${origin}/smoke/missing-file.js`, 'no-cors'],
  ['a precached path with a query', `${origin}/assets/index-abc123.js?v=2`, 'cors'],
])('%s goes to the network', (_, url, mode) => {
  expect(route(url, mode as RequestMode)).toBe('network');
});

test('a write to the app goes to the network', () => {
  expect(route(`${origin}/`, 'navigate', 'POST')).toBe('network');
});

test('the shell is the HTML entry, the built assets, and the files the shell renders with', () => {
  const built = [
    'index.html',
    'assets/index-abc123.js',
    'assets/index-def456.css',
    'assets/sqlite3-789abc.wasm',
    'assets/reader-0a1b2c.js',
    'pdfjs/wasm/openjpeg.wasm',
    'pdfjs/wasm/qcms_bg.wasm',
    'pdfjs/wasm/openjpeg_nowasm_fallback.js',
    'pdfjs/wasm/LICENSE_OPENJPEG',
    'favicon.svg',
    'manifest.webmanifest',
    'icons/icon-192.png',
    'icons/apple-touch-icon.png',
    'about.html',
    'privacy.html',
    'terms.html',
    'pages.css',
    'sw.js',
  ];

  expect(shellPaths(built)).toEqual([
    '/',
    '/assets/index-abc123.js',
    '/assets/index-def456.css',
    '/assets/sqlite3-789abc.wasm',
    '/assets/reader-0a1b2c.js',
    '/pdfjs/wasm/openjpeg.wasm',
    '/pdfjs/wasm/qcms_bg.wasm',
    '/pdfjs/wasm/openjpeg_nowasm_fallback.js',
    '/favicon.svg',
    '/manifest.webmanifest',
    '/icons/icon-192.png',
    '/icons/apple-touch-icon.png',
  ]);
});

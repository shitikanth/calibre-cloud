import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { cspProblems, expectedCsp } from './csp.ts';

const expectedHeader = Object.entries(expectedCsp)
  .map(([directive, sources]) => [directive, ...sources].join(' '))
  .join('; ');

test('accepts the expected policy', () => {
  expect(cspProblems(expectedHeader)).toEqual([]);
});

test('accepts the policy in deploy/cloudflare/_headers', () => {
  const headers = readFileSync(new URL('../_headers', import.meta.url), 'utf8');
  const line = headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:'));
  expect(line).toBeDefined();
  expect(cspProblems(line!.replace(/^\s*Content-Security-Policy:\s*/, ''))).toEqual([]);
});

test('ignores source order, directive order, and spacing', () => {
  const reordered = "script-src 'wasm-unsafe-eval'   'self';  " + expectedHeader.replace("script-src 'self' 'wasm-unsafe-eval'; ", '') + ' ;';
  expect(cspProblems(reordered)).toEqual([]);
});

test('reports a directive whose sources differ', () => {
  const changed = expectedHeader.replace("img-src 'self' blob: data:", "img-src 'self' https: data:");
  expect(cspProblems(changed)).toEqual(["img-src is 'self' data: https:, expected 'self' blob: data:"]);
});

test('reports a missing directive', () => {
  const missing = expectedHeader.replace("frame-ancestors 'self'", '').replace(/; $/, '');
  expect(cspProblems(missing)).toEqual(['frame-ancestors is missing']);
});

test('reports an extra directive', () => {
  expect(cspProblems(`${expectedHeader}; upgrade-insecure-requests`)).toEqual(['upgrade-insecure-requests is not expected']);
});

test('reports every difference at once', () => {
  const problems = cspProblems("default-src 'self'; script-src 'self'; sandbox");
  expect(problems).toContain("script-src is 'self', expected 'self' 'wasm-unsafe-eval'");
  expect(problems).toContain('style-src is missing');
  expect(problems).toContain('sandbox is not expected');
  expect(problems).not.toContain('default-src is missing');
});

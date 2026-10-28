import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { cspProblems } from './csp.ts';

const specHeader =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' blob:; img-src 'self' blob: data:; font-src 'self' blob: data:; media-src 'self' blob:; frame-src blob:; connect-src 'self' https://g.api.mega.co.nz https://*.userstorage.mega.co.nz https://www.googleapis.com; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

test('accepts the policy from the spec', () => {
  expect(cspProblems(specHeader)).toEqual([]);
});

test('accepts the policy in deploy/cloudflare/_headers', () => {
  const headers = readFileSync(new URL('../_headers', import.meta.url), 'utf8');
  const line = headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:'));
  expect(line).toBeDefined();
  expect(cspProblems(line!.replace(/^\s*Content-Security-Policy:\s*/, ''))).toEqual([]);
});

test('ignores source order, directive order, and spacing', () => {
  const reordered = "script-src 'wasm-unsafe-eval'   'self';  " + specHeader.replace("script-src 'self' 'wasm-unsafe-eval'; ", '') + ' ;';
  expect(cspProblems(reordered)).toEqual([]);
});

test('reports a directive whose sources differ', () => {
  const changed = specHeader.replace("img-src 'self' blob: data:", "img-src 'self' https: data:");
  expect(cspProblems(changed)).toEqual(["img-src is 'self' https: data:, expected 'self' blob: data:"]);
});

test('reports a missing directive', () => {
  const missing = specHeader.replace("; frame-ancestors 'self'", '');
  expect(cspProblems(missing)).toEqual(['frame-ancestors is missing']);
});

test('reports an extra directive', () => {
  expect(cspProblems(`${specHeader}; upgrade-insecure-requests`)).toEqual(['upgrade-insecure-requests is not expected']);
});

test('judges a repeated directive by its first occurrence, as browsers do', () => {
  expect(cspProblems(`${specHeader}; script-src *`)).toEqual([]);
  expect(cspProblems(`script-src *; ${specHeader}`)).toEqual(["script-src is *, expected 'self' 'wasm-unsafe-eval'"]);
});

test('reports every difference at once', () => {
  const problems = cspProblems("default-src 'self'; script-src 'self'; sandbox");
  expect(problems).toContain("script-src is 'self', expected 'self' 'wasm-unsafe-eval'");
  expect(problems).toContain('style-src is missing');
  expect(problems).toContain('sandbox is not expected');
  expect(problems).not.toContain('default-src is missing');
});

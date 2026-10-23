import { existsSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const expectedTypes: Record<string, string[]> = {
  '.mjs': ['text/javascript', 'application/javascript'],
  '.js': ['text/javascript', 'application/javascript'],
  '.wasm': ['application/wasm'],
};

function listDir(dir: string, dist: string): string[] {
  if (!existsSync(dir)) throw new Error(`no ${dir}: run pnpm build first, from the commit under test (${dist} must match the served build)`);
  return readdirSync(dir);
}

export function emittedAssets(dist: string): string[] {
  const workers = listDir(join(dist, 'assets'), dist).filter((name) => /^pdf\.worker\.min-.*\.mjs$/.test(name));
  if (workers.length !== 1) throw new Error(`expected one pdf.worker.min-*.mjs in ${join(dist, 'assets')}, found ${workers.length}`);
  const wasm = listDir(join(dist, 'pdfjs/wasm'), dist).filter((name) => extname(name) in expectedTypes);
  if (wasm.length === 0) throw new Error(`no pdf.js wasm or js files in ${join(dist, 'pdfjs/wasm')}`);
  return [...workers.map((name) => `/assets/${name}`), ...wasm.sort().map((name) => `/pdfjs/wasm/${name}`)];
}

export async function checkAssets(origin: string, assets: string[]): Promise<string[]> {
  const problems: string[] = [];
  for (const asset of assets) {
    const response = await fetch(new URL(asset, origin));
    await response.body?.cancel();
    if (!response.ok) {
      problems.push(`${asset}: HTTP ${response.status}`);
      continue;
    }
    const type = (response.headers.get('content-type') ?? '(none)').split(';')[0]!.trim().toLowerCase();
    const expected = expectedTypes[extname(asset)] ?? [];
    if (!expected.includes(type)) problems.push(`${asset}: content-type ${type}, expected ${expected.join(' or ')}`);
  }
  return problems;
}

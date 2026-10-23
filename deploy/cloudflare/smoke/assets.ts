import { existsSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const expectedTypes: Record<string, string[]> = {
  '.mjs': ['text/javascript', 'application/javascript'],
  '.js': ['text/javascript', 'application/javascript'],
  '.wasm': ['application/wasm'],
};

export function emittedAssets(dist: string): string[] {
  if (!existsSync(dist)) throw new Error(`no build at ${dist}: run pnpm build first`);
  const workers = readdirSync(join(dist, 'assets')).filter((name) => /^pdf\.worker\.min-.*\.mjs$/.test(name));
  if (workers.length !== 1) throw new Error(`expected one pdf.worker.min-*.mjs in ${join(dist, 'assets')}, found ${workers.length}`);
  const wasm = readdirSync(join(dist, 'pdfjs/wasm')).filter((name) => extname(name) in expectedTypes);
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
    const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim();
    const expected = expectedTypes[extname(asset)] ?? [];
    if (!expected.includes(type)) problems.push(`${asset}: content-type ${type}, expected ${expected.join(' or ')}`);
  }
  return problems;
}

import { resolve } from 'node:path';
import { checkAssets, emittedAssets } from './assets.ts';
import { smokeCheck } from './check.ts';

export const smokePaths = ['/', '/smoke/deep-link', '/books/1', '/books/1/read/EPUB'];

export async function smokeAndReport(origin: string): Promise<boolean> {
  const assets = emittedAssets(resolve(import.meta.dirname, '../dist'));
  console.log(`Smoke-checking ${origin} at ${smokePaths.join(', ')} and ${assets.length} pdf.js assets`);
  const problems = [...(await smokeCheck(origin, smokePaths)), ...(await checkAssets(origin, assets))];
  for (const problem of problems) console.error(`FAIL ${problem}`);
  if (problems.length === 0) console.log('Smoke check passed');
  return problems.length === 0;
}

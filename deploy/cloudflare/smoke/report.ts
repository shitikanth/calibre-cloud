import { resolve } from 'node:path';
import { checkAssets, checkSpaFallback, emittedAssets } from './assets.ts';
import { checkAuthRoutes } from './auth.ts';
import { smokeCheck } from './check.ts';
import { checkPublicPages, publicPages } from './pages.ts';

export const smokePaths = ['/', '/smoke/deep-link', '/books/1', '/books/1/read/EPUB'];

export async function smokeAndReport(origin: string): Promise<boolean> {
  const assets = emittedAssets(resolve(import.meta.dirname, '../dist'));
  console.log(
    `Smoke-checking ${origin} at ${smokePaths.join(', ')}, ${assets.length} pdf.js assets, the SPA fallback for fetches, the auth routes, and the public pages at ${publicPages.map((page) => page.path).join(', ')}`,
  );
  const problems = [
    ...(await smokeCheck(origin, smokePaths)),
    ...(await checkAssets(origin, assets)),
    ...(await checkSpaFallback(origin)),
    ...(await checkAuthRoutes(origin)),
    ...(await checkPublicPages(origin)),
  ];
  for (const problem of problems) console.error(`FAIL ${problem}`);
  if (problems.length === 0) console.log('Smoke check passed');
  return problems.length === 0;
}

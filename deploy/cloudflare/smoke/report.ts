import { smokeCheck } from './check.ts';

export const smokePaths = ['/', '/smoke/deep-link'];

export async function smokeAndReport(origin: string): Promise<boolean> {
  console.log(`Smoke-checking ${origin} at ${smokePaths.join(', ')}`);
  const problems = await smokeCheck(origin, smokePaths);
  for (const problem of problems) console.error(`FAIL ${problem}`);
  if (problems.length === 0) console.log('Smoke check passed');
  return problems.length === 0;
}

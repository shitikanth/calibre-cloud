import { smokeAndReport } from './report.ts';

const origin = process.argv[2];
if (!origin) {
  console.error('Usage: pnpm run smoke:deployed <origin>');
  process.exit(2);
}
if (!(await smokeAndReport(origin))) process.exit(1);

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { smokeAndReport } from '../smoke/report.ts';
import { deployedOrigin } from '../smoke/target.ts';

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const { status } = spawnSync(command, args, { stdio: 'inherit', env });
  if (status !== 0) process.exit(status ?? 1);
}

const outputFile = resolve(import.meta.dirname, '../.wrangler/deploy-output.ndjson');
rmSync(outputFile, { force: true });

run('playwright', ['install', '--only-shell', 'chromium']);
run('wrangler', ['deploy'], { ...process.env, WRANGLER_OUTPUT_FILE_PATH: outputFile });

if (!(await smokeAndReport(deployedOrigin(readFileSync(outputFile, 'utf8'))))) process.exit(1);

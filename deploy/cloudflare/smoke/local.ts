import { spawn } from 'node:child_process';
import { smokeAndReport } from './report.ts';

const port = process.env.SMOKE_PORT ?? '8799';
const origin = `http://127.0.0.1:${port}`;

const wrangler = spawn('wrangler', ['dev', '--ip', '127.0.0.1', '--port', port], {
  stdio: ['ignore', 'inherit', 'inherit'],
  detached: true,
});
const stopWrangler = () => {
  if (wrangler.pid && wrangler.exitCode === null) process.kill(-wrangler.pid, 'SIGTERM');
};

async function waitUntilServing(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (wrangler.exitCode !== null) throw new Error(`wrangler dev exited with code ${wrangler.exitCode}`);
    const serving = await fetch(origin).then((r) => r.ok, () => false);
    if (serving) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`wrangler dev did not serve ${origin} within ${timeoutMs} ms`);
}

let passed: boolean;
try {
  await waitUntilServing(60_000);
  passed = await smokeAndReport(origin);
} finally {
  stopWrangler();
}
if (!passed) process.exit(1);

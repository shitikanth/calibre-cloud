import { expect, test } from 'vitest';
import { deployedOrigin } from './target.ts';

const line = (entry: object) => JSON.stringify(entry);

test('reads the workers.dev URL from the last deploy entry in wrangler output', () => {
  const output = [
    line({ type: 'wrangler-session', version: 1, wrangler_version: '4.152.0' }),
    line({ type: 'deploy', worker_name: 'calibre-cloud', targets: ['https://old.example.workers.dev'] }),
    line({
      type: 'deploy',
      worker_name: 'calibre-cloud',
      version_id: 'v2',
      targets: ['calibre.example.com/*', 'https://calibre-cloud.owner.workers.dev'],
    }),
  ].join('\n');

  expect(deployedOrigin(output)).toBe('https://calibre-cloud.owner.workers.dev');
});

test('fails clearly when wrangler output has no deploy entry', () => {
  expect(() => deployedOrigin(line({ type: 'command-failed' }))).toThrow(/no deploy entry/);
});

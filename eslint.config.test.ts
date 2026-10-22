import { ESLint } from 'eslint';
import { describe, expect, test } from 'vitest';

const eslint = new ESLint();

async function platformImportErrors(filePath: string, source: string) {
  const [result] = await eslint.lintText(source, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports');
}

describe('platform import ban', () => {
  test.each([
    ['node:fs', "import { readFileSync } from 'node:fs';\nreadFileSync('x');\n"],
    ['node:fs/promises', "import { readFile } from 'node:fs/promises';\nawait readFile('x');\n"],
    ['cloudflare:workers', "import { env } from 'cloudflare:workers';\nconsole.log(env);\n"],
  ])('rejects %s in the SPA', async (_name, source) => {
    expect(await platformImportErrors('web/src/example.ts', source)).toHaveLength(1);
  });

  test('allows node:* and cloudflare:* in the deploy package', async () => {
    const source =
      "import { readFileSync } from 'node:fs';\nimport { env } from 'cloudflare:workers';\nconsole.log(readFileSync, env);\n";
    expect(await platformImportErrors('deploy/cloudflare/src/example.ts', source)).toHaveLength(0);
  });
});

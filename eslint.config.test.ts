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

describe('storage provider SDK boundary', () => {
  const source = "import { File } from 'megajs';\nconsole.log(File);\n";

  test.each(['web/src/library/example.ts', 'web/src/screens/example.tsx', 'web/src/storage/example.ts'])(
    'rejects megajs in %s',
    async (filePath) => {
      expect(await platformImportErrors(filePath, source)).toHaveLength(1);
    },
  );

  test('allows megajs inside the MEGA adapter', async () => {
    expect(await platformImportErrors('web/src/storage/mega/adapter.ts', source)).toHaveLength(0);
  });

  test.each([
    ['web/src/screens/example.tsx', '../storage/mega/link.ts'],
    ['web/src/connection/example.ts', '../storage/mega/provider.ts'],
    ['web/src/library/example.ts', '../storage/mega/adapter.ts'],
    ['web/src/example.ts', './storage/mega/provider.ts'],
  ])('rejects the MEGA provider module in %s', async (filePath, specifier) => {
    const providerSource = `import * as mega from '${specifier}';\nconsole.log(mega);\n`;
    expect(await platformImportErrors(filePath, providerSource)).toHaveLength(1);
  });

  test('allows the MEGA provider module inside the storage layer', async () => {
    const providerSource = "import * as mega from './mega/provider.ts';\nconsole.log(mega);\n";
    expect(await platformImportErrors('web/src/storage/providers.ts', providerSource)).toHaveLength(0);
  });

  test('still rejects node:* inside the MEGA adapter', async () => {
    const nodeSource = "import { readFileSync } from 'node:fs';\nreadFileSync('x');\n";
    expect(await platformImportErrors('web/src/storage/mega/adapter.ts', nodeSource)).toHaveLength(1);
  });
});

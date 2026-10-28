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

  test.each([
    ['node:crypto', "import { randomBytes } from 'node:crypto';\nrandomBytes(1);\n"],
    ['cloudflare:workers', "import { env } from 'cloudflare:workers';\nconsole.log(env);\n"],
  ])('rejects %s in the API core', async (_name, source) => {
    expect(await platformImportErrors('api/src/example.ts', source)).toHaveLength(1);
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

describe('renderer engine boundary', () => {
  const foliate = "import { View } from 'foliate-js/view.js';\nconsole.log(View);\n";
  const pdfjs = "import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';\nconsole.log(pdfjs);\n";

  test.each(['web/src/screens/reader-screen.tsx', 'web/src/reader/renderers.ts', 'web/src/reader/pdf/renderer.ts'])(
    'rejects foliate-js in %s',
    async (filePath) => {
      expect(await platformImportErrors(filePath, foliate)).toHaveLength(1);
    },
  );

  test.each(['web/src/screens/reader-screen.tsx', 'web/src/reader/renderers.ts', 'web/src/reader/foliate/renderer.ts'])(
    'rejects pdfjs-dist in %s',
    async (filePath) => {
      expect(await platformImportErrors(filePath, pdfjs)).toHaveLength(1);
    },
  );

  test('allows foliate-js inside the foliate renderer and pdfjs-dist inside the PDF renderer', async () => {
    expect(await platformImportErrors('web/src/reader/foliate/renderer.ts', foliate)).toHaveLength(0);
    expect(await platformImportErrors('web/src/reader/pdf/renderer.ts', pdfjs)).toHaveLength(0);
  });

  test('still rejects megajs inside a renderer', async () => {
    const source = "import { File } from 'megajs';\nconsole.log(File);\n";
    expect(await platformImportErrors('web/src/reader/foliate/renderer.ts', source)).toHaveLength(1);
  });
});

import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const platformModules = {
  group: ['node:*', 'cloudflare:*'],
  message: 'Platform modules are allowed only in deploy/. The app must run unchanged on any platform.',
};

const megaSdk = {
  group: ['megajs', 'megajs/*'],
  message: 'Only the MEGA storage adapter (web/src/storage/mega/) may use megajs.',
};

const megaProvider = {
  group: ['**/storage/mega', '**/storage/mega/*'],
  message: 'Only web/src/storage/ may import the MEGA provider. Everything above the storage boundary uses storage/providers.ts.',
};

const googleProvider = {
  group: ['**/storage/google', '**/storage/google/*'],
  message: 'Only web/src/storage/ may import the Google Drive provider. Everything above the storage boundary uses storage/providers.ts.',
};

const foliate = {
  group: ['foliate-js', 'foliate-js/*'],
  message: 'Only the foliate renderer (web/src/reader/foliate/) may use foliate-js.',
};

const pdfjs = {
  group: ['pdfjs-dist', 'pdfjs-dist/*'],
  message: 'Only the PDF renderer (web/src/reader/pdf/) may use pdfjs-dist.',
};

export default defineConfig([
  globalIgnores(['**/dist/', '**/.wrangler/', '**/.vitest/', '**/coverage/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{js,ts,tsx}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    ignores: ['deploy/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [platformModules, megaSdk, megaProvider, googleProvider, foliate, pdfjs] }] },
  },
  {
    files: ['web/vite.config.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [megaSdk, megaProvider, googleProvider, foliate, pdfjs] }] },
  },
  {
    files: ['web/src/storage/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [platformModules, megaSdk, foliate, pdfjs] }] },
  },
  {
    files: ['web/src/storage/mega/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [platformModules, foliate, pdfjs] }] },
  },
  {
    ignores: ['web/src/storage/google/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/googleapis\\.com\\/drive/], TemplateElement[value.raw=/googleapis\\.com\\/drive/]',
          message: 'Only the Google Drive provider (web/src/storage/google/) may call the Drive API.',
        },
      ],
    },
  },
  {
    files: ['web/src/reader/foliate/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [platformModules, megaSdk, megaProvider, googleProvider, pdfjs] }] },
  },
  {
    files: ['web/src/reader/pdf/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [platformModules, megaSdk, megaProvider, googleProvider, foliate] }] },
  },
]);

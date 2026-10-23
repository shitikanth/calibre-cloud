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

export default defineConfig([
  globalIgnores(['**/dist/', '**/.wrangler/', '**/.vitest/']),
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
    rules: { 'no-restricted-imports': ['error', { patterns: [platformModules, megaSdk] }] },
  },
  {
    files: ['web/src/storage/mega/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [platformModules] }] },
  },
]);

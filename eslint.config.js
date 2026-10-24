// ESLint flat config.
// - src/content runs in the browser (content script, isolated world).
// - scripts/ and test/ run in Node (test/e2e also ships code into the page).
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'artifacts/**', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'playground/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
  {
    files: ['scripts/**/*.mjs', 'test/**/*.{js,mjs}', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // End-to-end tests also contain code serialized and run in the page.
    files: ['test/e2e/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];

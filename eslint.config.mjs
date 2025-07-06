// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      semi: ['error', 'always'],
      quotes: ['error', 'single'],
    },
  },
  {
    files: ['src/client/**/*.ts', 'src/server/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-console': 'error',
    },
  },
  prettier,
);

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: [
    'next/core-web-vitals',
    'plugin:@typescript-eslint/strict',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { project: './tsconfig.json' },
  plugins: ['@typescript-eslint'],
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-eval': 'error',
    'no-new-func': 'error',
    'no-restricted-globals': [
      'error',
      { name: 'fetch', message: 'Use lib/signing/submit.ts wrapper which whitelists HF endpoints.' },
    ],
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'error',
  },
  ignorePatterns: ['out/**', 'out-mainnet/**', '.next/**', 'node_modules/**', 'coverage/**'],
  overrides: [
    {
      // submit.ts is the only legitimate fetch caller
      files: ['lib/signing/submit.ts', 'lib/signing/submit.test.ts'],
      rules: { 'no-restricted-globals': 'off' },
    },
  ],
};

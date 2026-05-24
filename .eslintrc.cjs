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
      // submit.ts (POST /exchange) and api.ts (POST /info) are the only legitimate
      // fetch callers; both hit the HF allow-listed origins.
      files: [
        'lib/signing/submit.ts',
        'lib/signing/submit.test.ts',
        'lib/api.ts',
        'lib/api.test.ts',
      ],
      rules: { 'no-restricted-globals': 'off' },
    },
  ],
};

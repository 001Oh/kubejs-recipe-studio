module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-alert': 'error',
    'no-console': ['error', { allow: ['warn', 'error'] }]
  },
  ignorePatterns: ['out/', 'dist/', 'node_modules/', '.cache/'],
  overrides: [
    {
      files: ['tests/**/*.ts', 'tests/**/*.tsx', '**/*.test.ts', '**/*.test.tsx'],
      rules: { 'no-console': 'off' }
    }
  ]
}

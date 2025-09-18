module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
  ],
  rules: {
    // Basic code quality
    'no-unused-vars': 'off', // Use TypeScript version instead
    'no-console': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
    
    // TypeScript specific
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  env: {
    node: true,
    es2020: true,
  },
  ignorePatterns: [
    'dist/**/*',
    'node_modules/**/*',
    '*.js',
    'jest.config.js',
    '.eslintrc.cjs'
  ],
};
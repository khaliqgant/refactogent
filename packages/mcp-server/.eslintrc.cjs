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
    // Critical errors only
    'no-unused-vars': 'off', // Use TypeScript version instead
    'no-console': 'off', // Allow console for CLI tools
    'prefer-const': 'error',
    'no-var': 'error',
    'no-case-declarations': 'error',
    
    // TypeScript specific - only critical issues
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      ignoreRestSiblings: true
    }],
    '@typescript-eslint/no-explicit-any': 'off', // Allow any for flexibility
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
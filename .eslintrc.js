module.exports = {
  env: {
    browser: true,
    es2021: true,
    jest: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {
    // Code quality rules
    'no-unused-vars': ['error', { 
      varsIgnorePattern: '^_',
      argsIgnorePattern: '^_' 
    }],
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
    
    // Best practices
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': 'error',
    'curly': 'error',
    
    // Code style
    'indent': ['error', 2],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'only-multiline'],
    
    // Async/await
    'require-await': 'warn',
    'no-return-await': 'error',
  },
  globals: {
    // Browser APIs that might not be recognized
    MediaRecorder: 'readonly',
    AudioContext: 'readonly',
    webkitAudioContext: 'readonly',
    WebSocket: 'readonly',
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/*.spec.js'],
      env: {
        jest: true,
      },
      rules: {
        // Relax some rules for test files
        'no-console': 'off',
      },
    },
    {
      files: ['tests/e2e/**/*.js'],
      env: {
        node: true,
      },
      globals: {
        page: 'readonly',
        browser: 'readonly',
        context: 'readonly',
      },
    },
  ],
};
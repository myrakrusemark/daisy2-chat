module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/web', '<rootDir>/tests/frontend'],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  collectCoverageFrom: [
    'web/**/*.js',
    '!web/static/porcupine-test-working/**',
    '!web/static/js/constants.js',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/frontend/setup.js'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/web/$1'
  },
  testTimeout: 10000
};
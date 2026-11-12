/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  setupFiles: ['<rootDir>/tests/setup/env.js'],
  testTimeout: 30000,
  // All suites share one PostgreSQL test database, so they must run serially.
  maxWorkers: 1,
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/types/**'],
  coverageReporters: ['text-summary', 'lcov'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', diagnostics: { warnOnly: false } }],
  },
};

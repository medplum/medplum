import type { Config } from 'jest';

export default {
  testEnvironment: 'node',
  testTimeout: 600000,
  testSequencer: '<rootDir>/jest.sequencer.js',
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  coverageDirectory: 'coverage',
  coverageReporters: ['json', 'text'],
  collectCoverageFrom: ['**/src/**/*', '!**/src/__mocks__/**/*.ts', '!**/src/migrations/**/*.ts'],
} satisfies Config;

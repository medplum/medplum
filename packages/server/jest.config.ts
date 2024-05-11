import type { Config } from 'jest';

export default {
  testEnvironment: 'node',
  testTimeout: 5000,
  testSequencer: '<rootDir>/jest.sequencer.js',
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  // Oddly, the glob `<rootDir>/src/seed*.test.ts` correctly matches both seed tests in the positive case in `jest.seed.config.ts`
  // But `!<rootDir>/src/seed*.test.ts` doesn't match both in the negative case, and only matches `seed-serial.test.ts`
  // That's why we use `!**/src/seed*.test.ts` here
  testMatch: ['<rootDir>/src/**/*.test.ts', '!**/src/seed*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  coverageDirectory: 'coverage',
  coverageReporters: ['json', 'text'],
  collectCoverageFrom: ['**/src/**/*', '!**/src/__mocks__/**/*.ts', '!**/src/migrations/**/*.ts'],
} satisfies Config;

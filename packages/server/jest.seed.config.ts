import type { Config } from 'jest';
import defaultConfig from './jest.config';

export default {
  ...defaultConfig,
  testTimeout: 300000,
  testMatch: ['<rootDir>/src/seed*.test.ts'],
  collectCoverageFrom: ['<rootDir>/src/**/*', '!**/src/__mocks__/**/*.ts', '!**/src/migrations/**/*.ts'],
} satisfies Config;

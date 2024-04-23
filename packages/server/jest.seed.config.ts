import type { Config } from 'jest';
import defaultConfig from './jest.config';

export default {
  ...defaultConfig,
  testMatch: ['<rootDir>/seed-tests/**/*.test.ts'],
  collectCoverageFrom: ['<rootDir>/seed-tests/**/*', '<rootDir>/src/**/*'],
} satisfies Config;

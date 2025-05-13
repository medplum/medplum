export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '@medplum/core': '<rootDir>/../../packages/core/src',
    '@medplum/mock': '<rootDir>/../../packages/mock/src',
    '@medplum/react': '<rootDir>/../../packages/react/src',
    '@medplum/fhirtypes': '<rootDir>/../../packages/fhirtypes/dist',
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
};

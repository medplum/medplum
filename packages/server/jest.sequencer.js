const Sequencer = require('@jest/test-sequencer').default;

/**
 * The Sequencer class determines the order of tests.
 * We want to ensure that the seeder test runs first.
 */
class CustomSequencer extends Sequencer {
  sort(tests) {
    // Test structure information
    // https://github.com/facebook/jest/blob/6b8b1404a1d9254e7d5d90a8934087a9c9899dab/packages/jest-runner/src/types.ts#L17-L21
    return Array.from(tests).sort((a, b) => {
      if (a.path.endsWith('seed.test.ts')) {
        return -1;
      }
      if (b.path.endsWith('seed.test.ts')) {
        return 1;
      }
      return a.path.localeCompare(b.path);
    });
  }
}

module.exports = CustomSequencer;

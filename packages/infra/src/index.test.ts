import { main } from './index';

describe('Infra', () => {
  test('Synth stack', () => {
    expect(() => main()).not.toThrow();
  });
});

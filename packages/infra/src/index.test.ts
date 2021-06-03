import { main } from './index';

test('Synth stack', () => {
  expect(main()).not.toBeNull();
});

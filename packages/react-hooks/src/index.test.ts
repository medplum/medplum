import { MedplumProvider, useResource, useSearch } from '.';

describe('Index', () => {
  test('Exports', () => {
    expect(MedplumProvider).toBeDefined();
    expect(useResource).toBeDefined();
    expect(useSearch).toBeDefined();
  });
});

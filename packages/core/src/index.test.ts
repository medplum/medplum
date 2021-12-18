import { MedplumClient } from '.';

describe('Index', () => {
  test('MedplumClient import', () => {
    const client = new MedplumClient({
      fetch: jest.fn(),
    });
    expect(client).toBeDefined();
  });
});

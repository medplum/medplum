import { vi } from 'vitest';
import { MedplumClient } from './client';

describe('Index', () => {
  test('MedplumClient import', () => {
    const client = new MedplumClient({
      fetch: vi.fn(),
    });
    expect(client).toBeDefined();
  });
});

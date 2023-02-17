import { Binary } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { loadTestConfig } from '../config';
import { getPresignedUrl } from './signer';

describe('Signer', () => {
  beforeAll(async () => {
    jest.useFakeTimers();
    await loadTestConfig();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('Presign URL', () => {
    jest.setSystemTime(new Date('2023-02-10T00:00:00.000Z'));

    const binary: Binary = {
      resourceType: 'Binary',
      id: randomUUID(),
      meta: {
        versionId: randomUUID(),
      },
    };

    expect(getPresignedUrl(binary)).toMatch(/\?Expires=1675990800&Key-Pair-Id=/);
  });
});

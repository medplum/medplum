import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HealthieClient } from './client';
import { fetchHealthiePatients, mapHealthieGender } from './patient';

type MockResponse = {
  json: () => Promise<any>;
  ok: boolean;
  status: number;
};

describe('fetchHealthiePatients', () => {
  let healthieClient: HealthieClient;
  const mockBaseUrl = 'https://api.example.com/graphql';
  const mockClientSecret = 'test-secret';
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    healthieClient = new HealthieClient(mockBaseUrl, mockClientSecret);
    // Mock fetch globally
    mockFetch = vi.fn().mockImplementation((): Promise<MockResponse> => {
      return Promise.resolve({
        json: () => Promise.resolve({}),
        ok: true,
        status: 200,
      });
    });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('returns patient data', async () => {
    const mockPatients = [
      {
        id: '123',
        active: true,
        name: 'John Doe',
        first_name: 'John',
        last_name: 'Doe',
        phone_number: '123-456-7890',
        gender: 'male',
        locations: [
          {
            zip: '12345',
            line1: '123 Main St',
            city: 'Test City',
            state: 'TS',
            country: 'Test Country',
          },
        ],
      },
    ];

    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { users: mockPatients } }),
          ok: true,
          status: 200,
        })
    );

    const result = await fetchHealthiePatients(healthieClient);
    expect(result).toEqual(mockPatients);
  });
});

describe('mapHealthieGender', () => {
  test('maps valid gender values', () => {
    expect(mapHealthieGender('male')).toBe('male');
    expect(mapHealthieGender('MALE')).toBe('male');
    expect(mapHealthieGender('female')).toBe('female');
    expect(mapHealthieGender('FEMALE')).toBe('female');
  });

  test('handles invalid or missing input', () => {
    expect(mapHealthieGender(undefined)).toBe('unknown');
    expect(mapHealthieGender('')).toBe('unknown');
    expect(mapHealthieGender('other')).toBe('other');
    expect(mapHealthieGender('non-binary')).toBe('other');
    expect(mapHealthieGender('prefer not to say')).toBe('other');
  });
});

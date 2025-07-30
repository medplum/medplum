import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HealthieClient } from './client';

type MockResponse = {
  json: () => Promise<any>;
  ok: boolean;
  status: number;
};

describe('HealthieClient', () => {
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

  describe('constructor', () => {
    test('creates instance with correct properties', () => {
      expect(healthieClient).toBeInstanceOf(HealthieClient);
    });
  });

  describe('query', () => {
    test('successful query', async () => {
      const mockResponse = {
        data: {
          users: [{ id: '123', name: 'Test User' }],
        },
      };

      mockFetch.mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () => Promise.resolve(mockResponse),
            ok: true,
            status: 200,
          })
      );

      const result = await healthieClient.query('{ users { id name } }');
      expect(result).toEqual(mockResponse.data);

      expect(mockFetch).toHaveBeenCalledWith(
        mockBaseUrl,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mockClientSecret}`,
            AuthorizationSource: 'API',
          },
        })
      );
    });

    test('handles GraphQL errors', async () => {
      const mockResponse = {
        errors: [{ message: 'GraphQL Error' }],
      };

      mockFetch.mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () => Promise.resolve(mockResponse),
            ok: true,
            status: 200,
          })
      );

      await expect(healthieClient.query('{ users { id name } }')).rejects.toThrow('GraphQL Error');
    });

    test('handles missing client secret', async () => {
      const invalidClient = new HealthieClient(mockBaseUrl, '');
      await expect(invalidClient.query('{ users { id name } }')).rejects.toThrow('Healthie credentials not provided');
    });
  });
});

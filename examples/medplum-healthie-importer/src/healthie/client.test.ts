// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HealthieClient } from './client';

type MockResponse = {
  json: () => Promise<any>;
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
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
        headers: { get: () => null },
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
            headers: { get: () => null },
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
            headers: { get: () => null },
          })
      );

      await expect(healthieClient.query('{ users { id name } }')).rejects.toThrow('GraphQL Error');
    });

    test('handles missing client secret', async () => {
      const invalidClient = new HealthieClient(mockBaseUrl, '');
      await expect(invalidClient.query('{ users { id name } }')).rejects.toThrow('Healthie credentials not provided');
    });
  });

  describe('retry logic', () => {
    test('retries on 429 rate limit and succeeds', async () => {
      const clientWithRetry = new HealthieClient(mockBaseUrl, mockClientSecret, {
        maxRetries: 2,
        baseDelayMs: 10, // Short delay for testing
      });

      const mockSuccessResponse = {
        data: { users: [{ id: '123' }] },
      };

      // First call returns 429, second succeeds
      mockFetch
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve({}),
              ok: false,
              status: 429,
              headers: { get: () => null },
            })
        )
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve(mockSuccessResponse),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        );

      const result = await clientWithRetry.query('{ users { id } }');

      expect(result).toEqual(mockSuccessResponse.data);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('retries on 500 server error and succeeds', async () => {
      const clientWithRetry = new HealthieClient(mockBaseUrl, mockClientSecret, {
        maxRetries: 2,
        baseDelayMs: 10,
      });

      const mockSuccessResponse = {
        data: { users: [{ id: '123' }] },
      };

      // First call returns 500, second succeeds
      mockFetch
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve({}),
              ok: false,
              status: 500,
              headers: { get: () => null },
            })
        )
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve(mockSuccessResponse),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        );

      const result = await clientWithRetry.query('{ users { id } }');

      expect(result).toEqual(mockSuccessResponse.data);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('respects Retry-After header', async () => {
      const clientWithRetry = new HealthieClient(mockBaseUrl, mockClientSecret, {
        maxRetries: 1,
        baseDelayMs: 10,
      });

      const mockSuccessResponse = {
        data: { users: [{ id: '123' }] },
      };

      // Return 429 with Retry-After header
      mockFetch
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve({}),
              ok: false,
              status: 429,
              headers: { get: (name: string) => (name === 'Retry-After' ? '1' : null) },
            })
        )
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve(mockSuccessResponse),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        );

      const result = await clientWithRetry.query('{ users { id } }');

      expect(result).toEqual(mockSuccessResponse.data);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('does not retry on regular GraphQL errors', async () => {
      const clientWithRetry = new HealthieClient(mockBaseUrl, mockClientSecret, {
        maxRetries: 3,
        baseDelayMs: 10,
      });

      const mockErrorResponse = {
        errors: [{ message: 'Invalid query' }],
      };

      mockFetch.mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () => Promise.resolve(mockErrorResponse),
            ok: true,
            status: 200,
            headers: { get: () => null },
          })
      );

      await expect(clientWithRetry.query('{ invalid }')).rejects.toThrow('GraphQL Error: Invalid query');
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retry
    });

    test('retries on TOO_MANY_REQUESTS GraphQL error and succeeds', async () => {
      const clientWithRetry = new HealthieClient(mockBaseUrl, mockClientSecret, {
        maxRetries: 2,
        baseDelayMs: 10,
      });

      const mockRateLimitResponse = {
        errors: [{ message: 'Too many requests. Please try again later.', code: 'TOO_MANY_REQUESTS' }],
      };

      const mockSuccessResponse = {
        data: { users: [{ id: '123' }] },
      };

      // First call returns rate limit error, second succeeds
      mockFetch
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve(mockRateLimitResponse),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        )
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve(mockSuccessResponse),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        );

      const result = await clientWithRetry.query('{ users { id } }');

      expect(result).toEqual(mockSuccessResponse.data);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('retries on TOO_MANY_REQUESTS in extensions.code', async () => {
      const clientWithRetry = new HealthieClient(mockBaseUrl, mockClientSecret, {
        maxRetries: 2,
        baseDelayMs: 10,
      });

      const mockRateLimitResponse = {
        errors: [{ message: 'Too many requests.', extensions: { code: 'TOO_MANY_REQUESTS' } }],
      };

      const mockSuccessResponse = {
        data: { users: [{ id: '123' }] },
      };

      mockFetch
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve(mockRateLimitResponse),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        )
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve(mockSuccessResponse),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        );

      const result = await clientWithRetry.query('{ users { id } }');

      expect(result).toEqual(mockSuccessResponse.data);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('retries on network errors and succeeds', async () => {
      const clientWithRetry = new HealthieClient(mockBaseUrl, mockClientSecret, {
        maxRetries: 2,
        baseDelayMs: 10,
      });

      const mockSuccessResponse = {
        data: { users: [{ id: '123' }] },
      };

      // First call throws network error, second succeeds
      mockFetch
        .mockImplementationOnce(() => Promise.reject(new Error('Network error')))
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve(mockSuccessResponse),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        );

      const result = await clientWithRetry.query('{ users { id } }');

      expect(result).toEqual(mockSuccessResponse.data);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('fails after max retries exhausted', async () => {
      const clientWithRetry = new HealthieClient(mockBaseUrl, mockClientSecret, {
        maxRetries: 2,
        baseDelayMs: 10,
      });

      // All calls return 503
      mockFetch.mockImplementation(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () => Promise.resolve({}),
            ok: false,
            status: 503,
            headers: { get: () => null },
          })
      );

      await expect(clientWithRetry.query('{ users { id } }')).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });
});

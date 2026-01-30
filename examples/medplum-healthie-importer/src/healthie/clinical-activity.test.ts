// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HealthieClient } from './client';
import {
  fetchMostRecentMedicationDate,
  fetchMostRecentAllergyDate,
  fetchMostRecentFormAnswerGroupDate,
  fetchLatestClinicalUpdate,
} from './clinical-activity';

type MockResponse = {
  json: () => Promise<any>;
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
};

describe('clinical-activity', () => {
  let healthieClient: HealthieClient;
  const mockBaseUrl = 'https://api.example.com/graphql';
  const mockClientSecret = 'test-secret';
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    healthieClient = new HealthieClient(mockBaseUrl, mockClientSecret);
    mockFetch = vi.fn().mockImplementation((): Promise<MockResponse> => {
      return Promise.resolve({
        json: () => Promise.resolve({ data: {} }),
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

  describe('fetchMostRecentMedicationDate', () => {
    test('returns updated_at when available', async () => {
      mockFetch.mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                data: {
                  medications: [{ id: 'med1', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-15T00:00:00Z' }],
                },
              }),
            ok: true,
            status: 200,
            headers: { get: () => null },
          })
      );

      const result = await fetchMostRecentMedicationDate(healthieClient, 'patient123');
      expect(result).toBe('2024-01-15T00:00:00.000Z');
    });

    test('returns created_at when updated_at is not available', async () => {
      mockFetch.mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                data: {
                  medications: [{ id: 'med1', created_at: '2024-01-01T00:00:00Z' }],
                },
              }),
            ok: true,
            status: 200,
            headers: { get: () => null },
          })
      );

      const result = await fetchMostRecentMedicationDate(healthieClient, 'patient123');
      expect(result).toBe('2024-01-01T00:00:00.000Z');
    });

    test('returns undefined when no medications', async () => {
      mockFetch.mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () => Promise.resolve({ data: { medications: [] } }),
            ok: true,
            status: 200,
            headers: { get: () => null },
          })
      );

      const result = await fetchMostRecentMedicationDate(healthieClient, 'patient123');
      expect(result).toBeUndefined();
    });
  });

  describe('fetchMostRecentAllergyDate', () => {
    test('returns updated_at when available', async () => {
      // Allergies are queried through User.last_updated_allergy
      mockFetch.mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                data: {
                  user: {
                    last_updated_allergy: {
                      id: 'allergy1',
                      created_at: '2024-01-01T00:00:00Z',
                      updated_at: '2024-02-01T00:00:00Z',
                    },
                  },
                },
              }),
            ok: true,
            status: 200,
            headers: { get: () => null },
          })
      );

      const result = await fetchMostRecentAllergyDate(healthieClient, 'patient123');
      expect(result).toBe('2024-02-01T00:00:00.000Z');
    });

    test('returns undefined when no allergies', async () => {
      mockFetch.mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () => Promise.resolve({ data: { user: { last_updated_allergy: null } } }),
            ok: true,
            status: 200,
            headers: { get: () => null },
          })
      );

      const result = await fetchMostRecentAllergyDate(healthieClient, 'patient123');
      expect(result).toBeUndefined();
    });
  });

  describe('fetchMostRecentFormAnswerGroupDate', () => {
    test('returns created_at from most recent form', async () => {
      mockFetch.mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                data: {
                  formAnswerGroups: [{ id: 'form1', created_at: '2024-03-01T00:00:00Z' }],
                },
              }),
            ok: true,
            status: 200,
            headers: { get: () => null },
          })
      );

      const result = await fetchMostRecentFormAnswerGroupDate(healthieClient, 'patient123');
      expect(result).toBe('2024-03-01T00:00:00.000Z');
    });

    test('returns undefined when no form answer groups', async () => {
      mockFetch.mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () => Promise.resolve({ data: { formAnswerGroups: [] } }),
            ok: true,
            status: 200,
            headers: { get: () => null },
          })
      );

      const result = await fetchMostRecentFormAnswerGroupDate(healthieClient, 'patient123');
      expect(result).toBeUndefined();
    });
  });

  describe('fetchLatestClinicalUpdate', () => {
    test('returns max date across all clinical resources', async () => {
      // Mock all three fetch calls
      mockFetch
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () =>
                Promise.resolve({
                  data: {
                    medications: [{ id: 'med1', created_at: '2024-01-01T00:00:00Z' }],
                  },
                }),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        )
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () =>
                Promise.resolve({
                  data: {
                    user: {
                      last_updated_allergy: { id: 'allergy1', created_at: '2024-02-15T00:00:00Z' },
                    },
                  },
                }),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        )
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () =>
                Promise.resolve({
                  data: {
                    formAnswerGroups: [{ id: 'form1', created_at: '2024-02-01T00:00:00Z' }],
                  },
                }),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        );

      const result = await fetchLatestClinicalUpdate(healthieClient, 'patient123');
      // Should return the allergy date as it's the most recent
      expect(result).toBe('2024-02-15T00:00:00.000Z');
    });

    test('returns undefined when no clinical data exists', async () => {
      // Mock all three fetch calls returning empty
      mockFetch
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve({ data: { medications: [] } }),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        )
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve({ data: { user: { last_updated_allergy: null } } }),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        )
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve({ data: { formAnswerGroups: [] } }),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        );

      const result = await fetchLatestClinicalUpdate(healthieClient, 'patient123');
      expect(result).toBeUndefined();
    });

    test('handles partial clinical data (only medications)', async () => {
      mockFetch
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () =>
                Promise.resolve({
                  data: {
                    medications: [{ id: 'med1', created_at: '2024-03-01T00:00:00Z' }],
                  },
                }),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        )
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve({ data: { user: { last_updated_allergy: null } } }),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        )
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () => Promise.resolve({ data: { formAnswerGroups: [] } }),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        );

      const result = await fetchLatestClinicalUpdate(healthieClient, 'patient123');
      expect(result).toBe('2024-03-01T00:00:00.000Z');
    });
  });
});

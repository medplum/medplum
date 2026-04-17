// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent } from '@medplum/core';
import type { Bot, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ListHealthiePatientsInput } from './list-healthie-patients';
import { handler } from './list-healthie-patients';

type MockResponse = {
  json: () => Promise<any>;
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
};

/**
 * Creates a test event with required BotEvent properties.
 * @param input - The input for the bot event.
 * @param secrets - The secrets for the bot event.
 * @returns A BotEvent with all required properties.
 */
function createTestEvent(
  input: ListHealthiePatientsInput,
  secrets: Record<string, { name: string; valueString: string }>
): BotEvent<ListHealthiePatientsInput> {
  return {
    input,
    contentType: 'application/json',
    secrets,
    bot: { reference: 'Bot/test-bot' } as Reference<Bot>,
  };
}

describe('list-healthie-patients handler', () => {
  let medplum: MockClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  const mockSecrets = {
    HEALTHIE_API_URL: { name: 'HEALTHIE_API_URL', valueString: 'https://api.healthie.com/graphql' },
    HEALTHIE_CLIENT_SECRET: { name: 'HEALTHIE_CLIENT_SECRET', valueString: 'test-secret' },
  };

  beforeEach(() => {
    medplum = new MockClient();
    mockFetch = vi.fn().mockImplementation(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { users: [] } }),
          ok: true,
          status: 200,
          headers: { get: () => null },
        })
    );
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('throws error when HEALTHIE_API_URL is missing', async () => {
    const event = createTestEvent(
      {},
      { HEALTHIE_CLIENT_SECRET: { name: 'HEALTHIE_CLIENT_SECRET', valueString: 'secret' } }
    );
    await expect(handler(medplum, event)).rejects.toThrow('HEALTHIE_API_URL must be set');
  });

  test('throws error when HEALTHIE_CLIENT_SECRET is missing', async () => {
    const event = createTestEvent(
      {},
      { HEALTHIE_API_URL: { name: 'HEALTHIE_API_URL', valueString: 'https://api.example.com' } }
    );
    await expect(handler(medplum, event)).rejects.toThrow('HEALTHIE_CLIENT_SECRET must be set');
  });

  test('returns all patients when no pagination specified', async () => {
    const mockUsers = [
      { id: '1', updated_at: '2024-01-01T00:00:00Z' },
      { id: '2', updated_at: '2024-01-02T00:00:00Z' },
    ];

    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { users: mockUsers } }),
          ok: true,
          status: 200,
          headers: { get: () => null },
        })
    );

    const event = createTestEvent({}, mockSecrets);

    const result = await handler(medplum, event);

    expect(result.patients).toHaveLength(2);
    expect(result.pagination).toEqual({
      page: 0,
      pageSize: 2,
      totalPages: 1,
      totalCount: 2,
      hasNextPage: false,
    });
  });

  test('applies pagination when specified', async () => {
    const mockUsers = [
      { id: '1', updated_at: '2024-01-01T00:00:00Z' },
      { id: '2', updated_at: '2024-01-02T00:00:00Z' },
      { id: '3', updated_at: '2024-01-03T00:00:00Z' },
    ];

    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { users: mockUsers } }),
          ok: true,
          status: 200,
          headers: { get: () => null },
        })
    );

    const event = createTestEvent({ pagination: { page: 0, pageSize: 2 } }, mockSecrets);

    const result = await handler(medplum, event);

    expect(result.patients).toHaveLength(2);
    expect(result.patients[0].id).toBe('1');
    expect(result.patients[1].id).toBe('2');
    expect(result.pagination).toEqual({
      page: 0,
      pageSize: 2,
      totalPages: 2,
      totalCount: 3,
      hasNextPage: true,
    });
  });

  test('returns correct page when page > 0', async () => {
    const mockUsers = [
      { id: '1', updated_at: '2024-01-01T00:00:00Z' },
      { id: '2', updated_at: '2024-01-02T00:00:00Z' },
      { id: '3', updated_at: '2024-01-03T00:00:00Z' },
    ];

    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { users: mockUsers } }),
          ok: true,
          status: 200,
          headers: { get: () => null },
        })
    );

    const event = createTestEvent({ pagination: { page: 1, pageSize: 2 } }, mockSecrets);

    const result = await handler(medplum, event);

    expect(result.patients).toHaveLength(1);
    expect(result.patients[0].id).toBe('3');
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 2,
      totalPages: 2,
      totalCount: 3,
      hasNextPage: false,
    });
  });

  test('applies maxResults cap', async () => {
    const mockUsers = [
      { id: '1', updated_at: '2024-01-01T00:00:00Z' },
      { id: '2', updated_at: '2024-01-02T00:00:00Z' },
      { id: '3', updated_at: '2024-01-03T00:00:00Z' },
      { id: '4', updated_at: '2024-01-04T00:00:00Z' },
    ];

    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { users: mockUsers } }),
          ok: true,
          status: 200,
          headers: { get: () => null },
        })
    );

    const event = createTestEvent({ maxResults: 2 }, mockSecrets);

    const result = await handler(medplum, event);

    expect(result.patients).toHaveLength(2);
    expect(result.pagination.totalCount).toBe(2);
  });

  test('filters by sinceLastUpdated', async () => {
    const mockUsers = [
      { id: '1', updated_at: '2024-01-01T00:00:00Z' },
      { id: '2', updated_at: '2024-01-15T00:00:00Z' },
      { id: '3', updated_at: '2024-02-01T00:00:00Z' },
    ];

    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { users: mockUsers } }),
          ok: true,
          status: 200,
          headers: { get: () => null },
        })
    );

    const event = createTestEvent({ filters: { sinceLastUpdated: '2024-01-10T00:00:00Z' } }, mockSecrets);

    const result = await handler(medplum, event);

    expect(result.patients).toHaveLength(2);
    expect(result.patients.map((p) => p.id)).toEqual(['2', '3']);
  });

  test('filters by name (partial match)', async () => {
    const mockUsers = [
      { id: '1', updated_at: '2024-01-01T00:00:00Z', first_name: 'John', last_name: 'Doe' },
      { id: '2', updated_at: '2024-01-02T00:00:00Z', first_name: 'Jane', last_name: 'Smith' },
      { id: '3', updated_at: '2024-01-03T00:00:00Z', first_name: 'Bob', last_name: 'Johnson' },
    ];

    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { users: mockUsers } }),
          ok: true,
          status: 200,
          headers: { get: () => null },
        })
    );

    const event = createTestEvent({ filters: { name: 'john' }, includeDemographics: true }, mockSecrets);

    const result = await handler(medplum, event);

    expect(result.patients).toHaveLength(2);
    expect(result.patients.map((p) => p.id)).toEqual(['1', '3']);
  });

  test('filters by dateOfBirth', async () => {
    const mockUsers = [
      { id: '1', updated_at: '2024-01-01T00:00:00Z', dob: '1990-01-15' },
      { id: '2', updated_at: '2024-01-02T00:00:00Z', dob: '1985-06-20' },
      { id: '3', updated_at: '2024-01-03T00:00:00Z', dob: '1990-01-15' },
    ];

    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { users: mockUsers } }),
          ok: true,
          status: 200,
          headers: { get: () => null },
        })
    );

    const event = createTestEvent({ filters: { dateOfBirth: '1990-01-15' }, includeDemographics: true }, mockSecrets);

    const result = await handler(medplum, event);

    expect(result.patients).toHaveLength(2);
    expect(result.patients.map((p) => p.id)).toEqual(['1', '3']);
  });

  test('includes demographics when requested', async () => {
    const mockUsers = [
      {
        id: '1',
        updated_at: '2024-01-01T00:00:00Z',
        first_name: 'John',
        last_name: 'Doe',
        dob: '1990-01-15',
      },
    ];

    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { users: mockUsers } }),
          ok: true,
          status: 200,
          headers: { get: () => null },
        })
    );

    const event = createTestEvent({ includeDemographics: true }, mockSecrets);

    const result = await handler(medplum, event);

    expect(result.patients[0].demographics).toEqual({
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-15',
    });
  });

  test('handles empty result', async () => {
    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { users: [] } }),
          ok: true,
          status: 200,
          headers: { get: () => null },
        })
    );

    const event = createTestEvent({}, mockSecrets);

    const result = await handler(medplum, event);

    expect(result.patients).toHaveLength(0);
    expect(result.pagination).toEqual({
      page: 0,
      pageSize: 0,
      totalPages: 1,
      totalCount: 0,
      hasNextPage: false,
    });
  });

  test('handles cursor pagination across multiple pages', async () => {
    // First page returns 50 users (page size) with cursor
    const page1Users = Array.from({ length: 50 }, (_, i) => ({
      id: `${i + 1}`,
      updated_at: '2024-01-01T00:00:00Z',
      cursor: `cursor_${i + 1}`,
    }));

    // Second page returns fewer than 50 users (end of data)
    const page2Users = Array.from({ length: 25 }, (_, i) => ({
      id: `${i + 51}`,
      updated_at: '2024-01-01T00:00:00Z',
    }));

    mockFetch
      .mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () => Promise.resolve({ data: { users: page1Users } }),
            ok: true,
            status: 200,
            headers: { get: () => null },
          })
      )
      .mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () => Promise.resolve({ data: { users: page2Users } }),
            ok: true,
            status: 200,
            headers: { get: () => null },
          })
      );

    const event = createTestEvent({}, mockSecrets);

    const result = await handler(medplum, event);

    expect(result.patients).toHaveLength(75);
    expect(result.pagination.totalCount).toBe(75);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  describe('includeClinicalUpdateDates', () => {
    test('includes latestClinicalUpdate when flag is true', async () => {
      const mockUsers = [{ id: '1', updated_at: '2024-01-01T00:00:00Z' }];

      // Mock the users query
      mockFetch.mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () => Promise.resolve({ data: { users: mockUsers } }),
            ok: true,
            status: 200,
            headers: { get: () => null },
          })
      );

      // Mock the clinical data queries (medications, allergies, forms)
      mockFetch
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () =>
                Promise.resolve({
                  data: { medications: [{ id: 'med1', created_at: '2024-02-01T00:00:00Z' }] },
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
                  data: { user: { last_updated_allergy: { id: 'allergy1', created_at: '2024-03-01T00:00:00Z' } } },
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
                  data: { formAnswerGroups: [{ id: 'form1', created_at: '2024-01-15T00:00:00Z' }] },
                }),
              ok: true,
              status: 200,
              headers: { get: () => null },
            })
        );

      const event = createTestEvent({ includeClinicalUpdateDates: true }, mockSecrets);

      const result = await handler(medplum, event);

      expect(result.patients).toHaveLength(1);
      expect(result.patients[0].latestClinicalUpdate).toBe('2024-03-01T00:00:00.000Z');
    });

    test('filters by sinceLastUpdated on clinical date when includeClinicalUpdateDates is true', async () => {
      const mockUsers = [
        { id: '1', updated_at: '2024-01-01T00:00:00Z' },
        { id: '2', updated_at: '2024-01-02T00:00:00Z' },
      ];

      // Mock the users query
      mockFetch.mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () => Promise.resolve({ data: { users: mockUsers } }),
            ok: true,
            status: 200,
            headers: { get: () => null },
          })
      );

      // Patient 1: clinical update from Jan 15 (before filter)
      mockFetch
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () =>
                Promise.resolve({
                  data: { medications: [{ id: 'med1', created_at: '2024-01-15T00:00:00Z' }] },
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

      // Patient 2: clinical update from Feb 15 (after filter)
      mockFetch
        .mockImplementationOnce(
          (): Promise<MockResponse> =>
            Promise.resolve({
              json: () =>
                Promise.resolve({
                  data: { medications: [{ id: 'med2', created_at: '2024-02-15T00:00:00Z' }] },
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

      const event = createTestEvent(
        {
          includeClinicalUpdateDates: true,
          filters: { sinceLastUpdated: '2024-02-01T00:00:00Z' },
        },
        mockSecrets
      );

      const result = await handler(medplum, event);

      // Only patient 2 should be included (clinical update after Feb 1)
      expect(result.patients).toHaveLength(1);
      expect(result.patients[0].id).toBe('2');
    });

    test('excludes patients with no clinical data when filtering by sinceLastUpdated', async () => {
      const mockUsers = [{ id: '1', updated_at: '2024-01-01T00:00:00Z' }];

      // Mock the users query
      mockFetch.mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () => Promise.resolve({ data: { users: mockUsers } }),
            ok: true,
            status: 200,
            headers: { get: () => null },
          })
      );

      // No clinical data for patient
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

      const event = createTestEvent(
        {
          includeClinicalUpdateDates: true,
          filters: { sinceLastUpdated: '2024-02-01T00:00:00Z' },
        },
        mockSecrets
      );

      const result = await handler(medplum, event);

      // Patient should be excluded (no clinical data)
      expect(result.patients).toHaveLength(0);
    });
  });
});

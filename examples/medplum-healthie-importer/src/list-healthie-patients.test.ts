// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ListHealthiePatientsInput, ListHealthiePatientsOutput } from './list-healthie-patients';
import { handler } from './list-healthie-patients';

type MockResponse = {
  json: () => Promise<any>;
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
};

describe('list-healthie-patients handler', () => {
  let medplum: MockClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  const mockSecrets = {
    HEALTHIE_API_URL: { valueString: 'https://api.healthie.com/graphql' },
    HEALTHIE_CLIENT_SECRET: { valueString: 'test-secret' },
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
    const event = {
      input: {},
      secrets: { HEALTHIE_CLIENT_SECRET: { valueString: 'secret' } },
    } as BotEvent<ListHealthiePatientsInput>;

    await expect(handler(medplum, event)).rejects.toThrow('HEALTHIE_API_URL must be set');
  });

  test('throws error when HEALTHIE_CLIENT_SECRET is missing', async () => {
    const event = {
      input: {},
      secrets: { HEALTHIE_API_URL: { valueString: 'https://api.example.com' } },
    } as BotEvent<ListHealthiePatientsInput>;

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

    const event = {
      input: {},
      secrets: mockSecrets,
    } as BotEvent<ListHealthiePatientsInput>;

    const result = await handler(medplum, event);

    expect(result.patients).toHaveLength(2);
    expect(result.pagination).toEqual({
      page: 1,
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

    const event = {
      input: {
        pagination: { page: 1, pageSize: 2 },
      },
      secrets: mockSecrets,
    } as BotEvent<ListHealthiePatientsInput>;

    const result = await handler(medplum, event);

    expect(result.patients).toHaveLength(2);
    expect(result.patients[0].id).toBe('1');
    expect(result.patients[1].id).toBe('2');
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 2,
      totalPages: 2,
      totalCount: 3,
      hasNextPage: true,
    });
  });

  test('returns correct page when page > 1', async () => {
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

    const event = {
      input: {
        pagination: { page: 2, pageSize: 2 },
      },
      secrets: mockSecrets,
    } as BotEvent<ListHealthiePatientsInput>;

    const result = await handler(medplum, event);

    expect(result.patients).toHaveLength(1);
    expect(result.patients[0].id).toBe('3');
    expect(result.pagination).toEqual({
      page: 2,
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

    const event = {
      input: {
        maxResults: 2,
      },
      secrets: mockSecrets,
    } as BotEvent<ListHealthiePatientsInput>;

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

    const event = {
      input: {
        filters: { sinceLastUpdated: '2024-01-10T00:00:00Z' },
      },
      secrets: mockSecrets,
    } as BotEvent<ListHealthiePatientsInput>;

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

    const event = {
      input: {
        filters: { name: 'john' },
        includeDemographics: true,
      },
      secrets: mockSecrets,
    } as BotEvent<ListHealthiePatientsInput>;

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

    const event = {
      input: {
        filters: { dateOfBirth: '1990-01-15' },
        includeDemographics: true,
      },
      secrets: mockSecrets,
    } as BotEvent<ListHealthiePatientsInput>;

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

    const event = {
      input: {
        includeDemographics: true,
      },
      secrets: mockSecrets,
    } as BotEvent<ListHealthiePatientsInput>;

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

    const event = {
      input: {},
      secrets: mockSecrets,
    } as BotEvent<ListHealthiePatientsInput>;

    const result = await handler(medplum, event);

    expect(result.patients).toHaveLength(0);
    expect(result.pagination).toEqual({
      page: 1,
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

    const event = {
      input: {},
      secrets: mockSecrets,
    } as BotEvent<ListHealthiePatientsInput>;

    const result = await handler(medplum, event);

    expect(result.patients).toHaveLength(75);
    expect(result.pagination.totalCount).toBe(75);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

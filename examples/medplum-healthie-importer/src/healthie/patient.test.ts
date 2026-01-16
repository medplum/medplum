// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { config } from 'dotenv';
import { HealthieClient } from './client';
import {
  fetchHealthiePatients,
  fetchHealthiePatientIds,
  fetchHealthiePatientIdsPage,
  mapHealthieGender,
} from './patient';

// Load environment variables from .env file
config({ quiet: true });

const originalFetch = global.fetch;

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

    mockFetch.mockImplementationOnce(() => {
      return Promise.resolve({
        json: () => Promise.resolve({ data: { users: mockPatients } }),
        ok: true,
        status: 200,
      });
    });

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

// Conditional tests that only run if Healthie environment variables are set
describe.skipIf(!process.env.HEALTHIE_API_URL || !process.env.HEALTHIE_CLIENT_SECRET)(
  'Healthie Patient Integration Tests',
  () => {
    let healthieClient: HealthieClient;

    beforeAll(() => {
      global.fetch = originalFetch;
    });

    beforeEach(() => {
      const apiUrl = process.env.HEALTHIE_API_URL as string;
      const clientSecret = process.env.HEALTHIE_CLIENT_SECRET as string;
      healthieClient = new HealthieClient(apiUrl, clientSecret);
    });

    test('should connect to Healthie API', async () => {
      expect(process.env.HEALTHIE_API_URL).toBeDefined();
      expect(process.env.HEALTHIE_CLIENT_SECRET).toBeDefined();
      expect(healthieClient).toBeDefined();
    });

    describe('fetchHealthiePatients', () => {
      test('should fetch real patients from Healthie API', async () => {
        // This test will make actual API calls to Healthie
        const patients = await fetchHealthiePatients(healthieClient);
        expect(Array.isArray(patients)).toBe(true);

        // If there are patients, validate the structure
        if (patients.length > 0) {
          const patient = patients[0];
          expect(patient).toHaveProperty('id');
          expect(patient).toHaveProperty('active');
          expect(patient).toHaveProperty('name');
        }
      });

      test('should handle API errors gracefully', async () => {
        // Test with invalid credentials
        const apiUrl = process.env.HEALTHIE_API_URL as string;
        const invalidClient = new HealthieClient(apiUrl, 'invalid-secret');

        await expect(fetchHealthiePatients(invalidClient)).rejects.toThrow();
      });

      test('should validate patient data structure', async () => {
        const patients = await fetchHealthiePatients(healthieClient);

        patients.forEach((patient) => {
          expect(typeof patient.id).toBe('string');
          expect(typeof patient.active).toBe('boolean');
          expect(typeof patient.name).toBe('string');

          if (patient.locations && patient.locations.length > 0) {
            const location = patient.locations[0];
            expect(location).toHaveProperty('zip');
            expect(location).toHaveProperty('line1');
            expect(location).toHaveProperty('city');
            expect(location).toHaveProperty('state');
          }
        });
      });
    });

    describe('fetchHealthiePatientIdsPage', () => {
      test('should handle cursor-based pagination', async () => {
        const firstPage = await fetchHealthiePatientIdsPage(healthieClient, { pageSize: 1 });

        if (firstPage.hasNextPage && firstPage.nextCursor) {
          const secondPage = await fetchHealthiePatientIdsPage(healthieClient, {
            after: firstPage.nextCursor,
            pageSize: 1,
          });

          expect(secondPage).toHaveProperty('users');
          expect(Array.isArray(secondPage.users)).toBe(true);
        }
      });
    });

    describe('fetchHealthiePatientIds', () => {
      test('should fetch all patient IDs', async () => {
        const patientIds = await fetchHealthiePatientIds(healthieClient);

        expect(Array.isArray(patientIds)).toBe(true);

        // If there are patient IDs, validate they are strings
        for (const id of patientIds) {
          expect(typeof id).toBe('string');
          expect(id.length).toBeGreaterThan(0);
        }
      });

      test('should handle sinceLastUpdated filter', async () => {
        // Step 1: Fetch all patient IDs without filter
        const allPatientIds = await fetchHealthiePatientIds(healthieClient);

        // Skip test if there are no patients
        if (allPatientIds.length === 0) {
          throw new Error('No patients found during filter test');
        }

        // Step 2: Get patient data with timestamps to find a middle point
        const firstPageResult = await fetchHealthiePatientIdsPage(healthieClient, { pageSize: 3 });

        // Skip test if there are not enough patients to test filtering
        if (firstPageResult.users.length < 2) {
          console.log('Not enough patients to test filtering, skipping');
          return;
        }

        // Step 3: Find a timestamp in the middle of the results
        const sortedUsers = firstPageResult.users.sort(
          (a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
        );

        const middleIndex = Math.floor(sortedUsers.length / 2);
        const middleTimestamp = sortedUsers[middleIndex].updated_at;

        // Step 4: Re-run with the since filter
        const filteredPatientIds = await fetchHealthiePatientIds(healthieClient, {
          sinceLastUpdated: middleTimestamp,
        });

        // Step 5: Verify the filtered results are smaller or equal to the original
        expect(Array.isArray(filteredPatientIds)).toBe(true);
        expect(filteredPatientIds.length).toBeLessThanOrEqual(allPatientIds.length);

        // All IDs should be strings
        filteredPatientIds.forEach((id) => {
          expect(typeof id).toBe('string');
        });

        console.log(
          `Filter test: All patients: ${allPatientIds.length}, Filtered: ${filteredPatientIds.length}, Middle timestamp: ${middleTimestamp}`
        );
      });

      test('should handle empty results', async () => {
        // Use a future date to likely get empty results
        const future = new Date();
        future.setDate(future.getDate() + 1);

        const patientIds = await fetchHealthiePatientIds(healthieClient, {
          sinceLastUpdated: future.toISOString(),
        });

        expect(Array.isArray(patientIds)).toBe(true);
        // Should still be a valid array, even if empty
      });

      test('should return unique patient IDs', async () => {
        const patientIds = await fetchHealthiePatientIds(healthieClient);

        const uniqueIds = [...new Set(patientIds)];
        expect(uniqueIds).toHaveLength(patientIds.length);
      });
    });
  }
);

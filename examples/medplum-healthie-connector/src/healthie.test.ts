import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { HealthieClient, mapHealthieGender, parseDosage } from './healthie';

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

  describe('fetchPatients', () => {
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

      const result = await healthieClient.fetchPatients();
      expect(result).toEqual(mockPatients);
    });
  });

  describe('fetchMedications', () => {
    test('returns medication data for a patient', async () => {
      const mockMedications = [
        {
          id: 'med123',
          name: 'Test Medication',
          active: true,
          start_date: '2024-01-01',
          end_date: '2024-12-31',
        },
      ];

      mockFetch.mockImplementationOnce(
        (): Promise<MockResponse> =>
          Promise.resolve({
            json: () => Promise.resolve({ data: { medications: mockMedications } }),
            ok: true,
            status: 200,
          })
      );

      const result = await healthieClient.fetchMedications('patient123');
      expect(result).toEqual(mockMedications);

      // Verify the query includes the patient ID
      expect(mockFetch).toHaveBeenCalledWith(
        mockBaseUrl,
        expect.objectContaining({
          body: expect.stringContaining('patient123'),
        })
      );
    });
  });
});

describe('parseDosage', () => {
  test('parses valid dosage strings', () => {
    expect(parseDosage('10 MG')).toEqual({
      value: 10,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('650 MG')).toEqual({
      value: 650,
      unit: 'MG',
      system: 'http://unitsofmeasure.org',
    });

    expect(parseDosage('5.5 ML')).toEqual({
      value: 5.5,
      unit: 'ML',
      system: 'http://unitsofmeasure.org',
    });
  });

  test('handles invalid or missing input', () => {
    expect(parseDosage(undefined)).toBeUndefined();
    expect(parseDosage('')).toBeUndefined();
    expect(parseDosage('invalid')).toBeUndefined();
    expect(parseDosage('10')).toBeUndefined();
    expect(parseDosage('MG')).toBeUndefined();
    expect(parseDosage('10 mg mg')).toBeUndefined();
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

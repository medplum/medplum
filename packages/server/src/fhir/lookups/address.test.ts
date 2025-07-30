import { Operator, WithId } from '@medplum/core';
import { Address, InsurancePlan, Location, Patient, Resource, ResourceType } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getLogger } from '../../logger';
import { withTestContext } from '../../test.setup';
import { getSystemRepo } from '../repo';
import { AddressTable, AddressTableRow } from './address';

describe('Address Lookup Table', () => {
  const systemRepo = getSystemRepo();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Patient resource with address', () =>
    withTestContext(async () => {
      const addressLine = randomUUID();
      const addressCity = randomUUID();
      const postalCode = randomUUID();

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        address: [
          {
            use: 'home',
            line: [addressLine],
            city: addressCity,
            state: 'CA',
            postalCode,
            country: 'US',
          },
        ],
      });

      const searchResult1 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'address',
            operator: Operator.CONTAINS,
            value: addressLine,
          },
        ],
      });
      expect(searchResult1.entry?.length).toStrictEqual(1);
      expect(searchResult1.entry?.[0]?.resource?.id).toStrictEqual(patient.id);

      const searchResult2 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'address-city',
            operator: Operator.EQUALS,
            value: addressCity,
          },
        ],
      });
      expect(searchResult2.entry?.length).toStrictEqual(1);
      expect(searchResult2.entry?.[0]?.resource?.id).toStrictEqual(patient.id);

      const searchResult3 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'address-postalcode',
            operator: Operator.EQUALS,
            value: postalCode,
          },
        ],
      });
      expect(searchResult3.entry?.length).toStrictEqual(1);
      expect(searchResult3.entry?.[0]?.resource?.id).toStrictEqual(patient.id);
    }));

  test('Multiple addresses', () =>
    withTestContext(async () => {
      const address = randomUUID();
      const other = randomUUID();

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        address: [
          { use: 'home', line: [address] },
          { use: 'home', line: [other] },
        ],
      });

      const searchResult = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'address',
            operator: Operator.EQUALS,
            value: address,
          },
        ],
      });
      expect(searchResult.entry?.length).toStrictEqual(1);
      expect(searchResult.entry?.[0]?.resource?.id).toStrictEqual(patient.id);

      const searchResult2 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'address',
            operator: Operator.EQUALS,
            value: other,
          },
        ],
      });
      expect(searchResult2.entry?.length).toStrictEqual(1);
      expect(searchResult2.entry?.[0]?.resource?.id).toStrictEqual(patient.id);
    }));

  test.each([
    [
      'Patient' as ResourceType,
      (address: string): Patient => ({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        address: [{ use: 'home', line: [address] }],
      }),
    ],
    [
      'InsurancePlan' as ResourceType,
      (address: string): InsurancePlan => ({
        resourceType: 'InsurancePlan',
        name: 'Test Insurance Plan',
        contact: [{ address: { use: 'home', line: [address] } }],
      }),
    ],
    [
      'Location' as ResourceType,
      (address: string): Location => ({
        resourceType: 'Location',
        address: { use: 'home', line: [address] },
      }),
    ],
  ])('Update %s address', (resourceType, buildResource) =>
    withTestContext(async () => {
      const address1 = randomUUID();
      const address2 = randomUUID();

      const resource1 = await systemRepo.createResource(buildResource(address1));

      const bundle2 = await systemRepo.search({
        resourceType,
        filters: [
          {
            code: 'address',
            operator: Operator.EQUALS,
            value: address1,
          },
        ],
      });
      expect(bundle2.entry?.length).toStrictEqual(1);
      expect(bundle2.entry?.[0]?.resource?.id).toStrictEqual(resource1.id);

      const bundle3 = await systemRepo.search({
        resourceType,
        filters: [
          {
            code: 'address',
            operator: Operator.EQUALS,
            value: address2,
          },
        ],
      });
      expect(bundle3.entry?.length).toStrictEqual(0);

      await systemRepo.updateResource({
        ...resource1,
        ...buildResource(address2),
      } as Resource);

      const bundle5 = await systemRepo.search({
        resourceType,
        filters: [
          {
            code: 'address',
            operator: Operator.EQUALS,
            value: address1,
          },
        ],
      });
      expect(bundle5.entry?.length).toStrictEqual(0);

      const bundle6 = await systemRepo.search({
        resourceType,
        filters: [
          {
            code: 'address',
            operator: Operator.EQUALS,
            value: address2,
          },
        ],
      });
      expect(bundle6.entry?.length).toStrictEqual(1);
      expect(bundle6.entry?.[0]?.resource?.id).toStrictEqual(resource1.id);
    })
  );

  test('Purges related resource type', async () => {
    const db = { query: jest.fn().mockReturnValue({ rowCount: 0, rows: [] }) } as unknown as PoolClient;

    const table = new AddressTable();
    await table.purgeValuesBefore(db, 'Patient', '2024-01-01T00:00:00Z');

    expect(db.query).toHaveBeenCalled();
  });

  test('Does not purge unrelated resource type', async () => {
    const db = { query: jest.fn() } as unknown as PoolClient;

    const table = new AddressTable();
    await table.purgeValuesBefore(db, 'AuditEvent', '2024-01-01T00:00:00Z');

    expect(db.query).not.toHaveBeenCalled();
  });

  test('extractValues defensive against nullish and empty string values', () => {
    const table = new AddressTable();
    const r1: WithId<Patient> = {
      resourceType: 'Patient',
      id: '1',
      address: undefined,
    };
    const result1: any[] = [];
    table.extractValues(result1, r1);
    expect(result1).toStrictEqual([]);

    const r2: WithId<Patient> = {
      resourceType: 'Patient',
      id: '2',
      address: [
        {},
        null,
        undefined,
        {
          use: 'work',
          line: ['Line 1'],
          city: 'City 1',
          country: 'Country 1',
          postalCode: 'Postal 1',
          state: 'State 1',
        },
        { line: ['Line 1', 'Line 2'], city: '' }, // empty city should be ignored
        { line: ['Line 1', 'Line 2'] },
        { use: 'home' },
      ] as unknown as Address[],
    };

    const result2: any[] = [];
    table.extractValues(result2, r2);
    expect(result2).toStrictEqual([
      {
        resourceId: '2',
        address: 'Line 1, City 1, State 1, Postal 1',
        city: 'City 1',
        country: 'Country 1',
        postalCode: 'Postal 1',
        state: 'State 1',
        use: 'work',
      },
      {
        address: 'Line 1, Line 2',
        city: undefined,
        country: undefined,
        postalCode: undefined,
        resourceId: '2',
        state: undefined,
        use: undefined,
      },
      {
        address: undefined,
        city: undefined,
        country: undefined,
        postalCode: undefined,
        resourceId: '2',
        state: undefined,
        use: 'home',
      },
    ]);

    const r3: WithId<InsurancePlan> = {
      resourceType: 'InsurancePlan',
      id: '3',
      contact: [
        {
          address: {
            use: 'work',
            line: ['Line 1'],
            city: 'City 1',
            country: 'Country 1',
            postalCode: 'Postal 1',
            state: 'State 1',
          },
        },
        {
          address: {
            use: 'work',
            line: ['Line 1'],
            city: 'City 1',
            country: 'Country 1',
            postalCode: 'Postal 1',
            state: 'State 1',
          },
        },
      ],
    };

    const result3: any[] = [];
    table.extractValues(result3, r3);
    expect(result3).toStrictEqual([
      {
        resourceId: '3',
        address: 'Line 1, City 1, State 1, Postal 1',
        city: 'City 1',
        country: 'Country 1',
        postalCode: 'Postal 1',
        state: 'State 1',
        use: 'work',
      },
    ]);
  });

  test('extractValues multiple patients with identical address', () => {
    const table = new AddressTable();

    const r1: WithId<Patient> = {
      resourceType: 'Patient',
      id: '1',
      name: [{ given: ['Alice'], family: 'Smith' }],
      address: [
        {
          line: ['500 Jefferson Street'],
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94109',
        },
        {
          line: ['500 Jefferson Street'],
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94109',
        },
      ],
    };

    const r2: WithId<Patient> = {
      resourceType: 'Patient',
      id: '2',
      name: [{ given: ['Bob'], family: 'Smith' }],
      address: [
        {
          line: ['500 Jefferson Street'],
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94109',
        },
        {
          line: ['500 Jefferson Street'],
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94109',
        },
      ] as unknown as Address[],
    };

    const result: AddressTableRow[] = [];
    table.extractValues(result, r1);
    table.extractValues(result, r2);

    expect(result).toStrictEqual([
      {
        resourceId: '1',
        address: '500 Jefferson Street, San Francisco, CA, 94109',
        city: 'San Francisco',
        country: undefined,
        postalCode: '94109',
        state: 'CA',
        use: undefined,
      },
      {
        resourceId: '2',
        address: '500 Jefferson Street, San Francisco, CA, 94109',
        city: 'San Francisco',
        country: undefined,
        postalCode: '94109',
        state: 'CA',
        use: undefined,
      },
    ]);
  });

  test('Errors logged and rethrown', async () => {
    const db = { query: jest.fn().mockReturnValue({ rowCount: 0, rows: [] }) } as unknown as PoolClient;
    const table = new AddressTable();
    const r1: WithId<Patient> = {
      resourceType: 'Patient',
      id: '1',
      name: [{ given: ['Alice'], family: 'Smith' }],
      address: [
        {
          line: ['500 Jefferson Street'],
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94109',
        },
      ] as unknown as Address[],
    };

    const extractValuesSpy = jest.spyOn(table, 'extractValues').mockImplementation(() => {
      throw new Error('test error');
    });

    const logger = getLogger();
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(async () => table.batchIndexResources(db, [r1], false)).rejects.toThrow('test error');
    expect(extractValuesSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Error extracting values for resource', {
      resource: 'Patient/1',
      err: expect.any(Error),
    });

    errorSpy.mockClear();
  });
});

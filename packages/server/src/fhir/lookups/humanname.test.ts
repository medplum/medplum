// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatFamilyName, formatGivenName, formatHumanName, Operator, WithId } from '@medplum/core';
import { HumanName, Patient, Practitioner, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { bundleContains, withTestContext } from '../../test.setup';
import { getSystemRepo } from '../repo';
import { getHumanNameSortValue, HumanNameTable, HumanNameTableRow } from './humanname';

describe('HumanName Lookup Table', () => {
  const systemRepo = getSystemRepo();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('HumanName', () =>
    withTestContext(async () => {
      const name = randomUUID();

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: name }],
      });

      const searchResult = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: name,
          },
        ],
      });
      expect(searchResult.entry?.length).toStrictEqual(1);
      expect(searchResult.entry?.[0]?.resource?.id).toStrictEqual(patient.id);
    }));

  test('Search with spaces', () =>
    withTestContext(async () => {
      const name1 = randomUUID();
      const name2 = randomUUID();
      const name3 = randomUUID();

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: [name1, name2], family: name3 }],
      });

      const searchResult = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: `${name1} ${name3}`,
          },
        ],
      });
      expect(searchResult.entry?.length).toStrictEqual(1);
      expect(searchResult.entry?.[0]?.resource?.id).toStrictEqual(patient.id);
    }));

  test('Search with commas', () =>
    withTestContext(async () => {
      const names = [randomUUID(), randomUUID(), randomUUID()];
      const patients = [];

      for (const name of names) {
        const patient = await systemRepo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ family: name }],
        });
        patients.push(patient);
      }

      const searchResult = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: `${names[0]},${names[1]}`,
          },
        ],
      });
      expect(searchResult.entry?.length).toStrictEqual(2);
      expect(bundleContains(searchResult, patients[0])).toBeDefined();
      expect(bundleContains(searchResult, patients[1])).toBeDefined();
      expect(bundleContains(searchResult, patients[2])).toBeUndefined();
    }));

  test('Search with blank name', async () => {
    const searchResult = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: '',
        },
      ],
    });
    expect(searchResult.entry).toBeDefined();
  });

  test('Multiple names', () =>
    withTestContext(async () => {
      const name = randomUUID();
      const other = randomUUID();

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [
          { given: ['Alice'], family: name },
          { given: ['Alice'], family: other },
        ],
      });

      const searchResult = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: name,
          },
        ],
      });
      expect(searchResult.entry?.length).toStrictEqual(1);
      expect(searchResult.entry?.[0]?.resource?.id).toStrictEqual(patient.id);

      const searchResult2 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: other,
          },
        ],
      });
      expect(searchResult2.entry?.length).toStrictEqual(1);
      expect(searchResult2.entry?.[0]?.resource?.id).toStrictEqual(patient.id);
    }));

  test('Update name', () =>
    withTestContext(async () => {
      const name1 = randomUUID();
      const name2 = randomUUID();

      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: name1 }],
      });

      const bundle2 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: name1,
          },
        ],
      });
      expect(bundle2.entry?.length).toStrictEqual(1);
      expect(bundle2.entry?.[0]?.resource?.id).toStrictEqual(patient1.id);

      const bundle3 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: name2,
          },
        ],
      });
      expect(bundle3.entry?.length).toStrictEqual(0);

      await systemRepo.updateResource<Patient>({
        ...patient1,
        name: [{ given: ['Alice'], family: name2 }],
      });

      const bundle5 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: name1,
          },
        ],
      });
      expect(bundle5.entry?.length).toStrictEqual(0);

      const bundle6 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: name2,
          },
        ],
      });
      expect(bundle6.entry?.length).toStrictEqual(1);
      expect(bundle6.entry?.[0]?.resource?.id).toStrictEqual(patient1.id);
    }));

  test('Search on text', () =>
    withTestContext(async () => {
      const name1 = randomUUID();
      const name2 = randomUUID();

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family: name1, text: `${name1} ${name2}` }],
      });

      const searchResult = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: `${name2}`,
          },
        ],
      });
      expect(searchResult.entry?.length).toStrictEqual(1);
      expect(searchResult.entry?.[0]?.resource?.id).toStrictEqual(patient.id);
    }));

  test('Sort by name with some missing', () =>
    withTestContext(async () => {
      const name = randomUUID();
      const identifier = randomUUID();

      const p1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        identifier: [{ value: identifier }],
        name: [{ given: ['Alice'], family: name }],
      });

      const p2 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        identifier: [{ value: identifier }],
        name: [{ given: ['Bob'], family: name }],
      });

      const p3 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        identifier: [{ value: identifier }],
      });

      const ascending = await systemRepo.search({
        resourceType: 'Patient',
        sortRules: [{ code: 'name' }],
        filters: [{ code: 'identifier', operator: Operator.EQUALS, value: identifier }],
      });

      expect(ascending.entry?.length).toStrictEqual(3);
      expect(ascending.entry?.map((e) => e.resource?.id)).toStrictEqual([p1.id, p2.id, p3.id]);

      const descending = await systemRepo.search({
        resourceType: 'Patient',
        sortRules: [{ code: 'name', descending: true }],
        filters: [{ code: 'identifier', operator: Operator.EQUALS, value: identifier }],
      });

      expect(descending.entry?.length).toStrictEqual(3);
      expect(descending.entry?.map((e) => e.resource?.id)).toStrictEqual([p3.id, p2.id, p1.id]);
    }));

  test.failing('FAILING Sort by name multi-type', () =>
    withTestContext(async () => {
      const name = randomUUID();
      const identifier = randomUUID();

      const prac1 = await systemRepo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        identifier: [{ value: identifier }],
        name: [{ given: ['Ashley'], family: name }],
      });

      const prac2 = await systemRepo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        identifier: [{ value: identifier }],
        name: [{ given: ['Bobby'], family: name }],
      });
      const ascendingMultiType = await systemRepo.search({
        resourceType: 'MultipleTypes' as ResourceType,
        types: ['Patient', 'Practitioner'],
        sortRules: [{ code: 'name' }],
        filters: [{ code: 'identifier', operator: Operator.EQUALS, value: identifier }],
      });

      expect(ascendingMultiType.entry?.length).toStrictEqual(5);
      expect(ascendingMultiType.entry?.map((e) => e.resource?.id)).toStrictEqual([prac1.id, prac2.id]);
    })
  );

  test('Purges related resource type', async () => {
    const db = { query: jest.fn().mockReturnValue({ rowCount: 0, rows: [] }) } as unknown as PoolClient;

    const table = new HumanNameTable();
    await table.purgeValuesBefore(db, 'Patient', '2024-01-01T00:00:00Z');

    expect(db.query).toHaveBeenCalled();
  });

  test('Does not purge unrelated resource type', async () => {
    const db = { query: jest.fn() } as unknown as PoolClient;

    const table = new HumanNameTable();
    await table.purgeValuesBefore(db, 'AuditEvent', '2024-01-01T00:00:00Z');

    expect(db.query).not.toHaveBeenCalled();
  });

  test('extractValues defensive against nullish values', () => {
    const table = new HumanNameTable();
    const r1: WithId<Patient> = {
      resourceType: 'Patient',
      id: '1',
      name: undefined,
    };
    let result: any[] = [];
    table.extractValues(result, r1);
    expect(result).toStrictEqual([]);

    const r2: WithId<Patient> = {
      resourceType: 'Patient',
      id: '2',
      name: [{}, null, undefined, { family: 'Family' }, { family: 'Family' }] as unknown as HumanName[],
    };

    result = [];
    table.extractValues(result, r2);
    expect(result).toStrictEqual([
      {
        resourceId: '2',
        name: 'Family',
        given: undefined,
        family: 'Family',
      },
    ]);
  });

  test('extractValues multiple resources with identical name', () => {
    const table = new HumanNameTable();

    const r1: WithId<Patient> = {
      resourceType: 'Patient',
      id: '1',
      name: [{ given: ['Alice'], family: 'Smith', use: 'official', prefix: ['Ms'] }],
    };

    const r2: WithId<Patient> = {
      resourceType: 'Patient',
      id: '2',
      name: [{ given: ['Alice'], family: 'Smith', use: 'official', prefix: ['Ms'] }],
    };

    const result: HumanNameTableRow[] = [];
    table.extractValues(result, r1);
    table.extractValues(result, r2);

    expect(result).toStrictEqual([
      {
        resourceId: '1',
        name: 'Ms Alice Smith',
        given: 'Alice',
        family: 'Smith',
      },
      {
        resourceId: '2',
        name: 'Ms Alice Smith',
        given: 'Alice',
        family: 'Smith',
      },
    ]);
  });
});

describe('getHumanNameSortValue', () => {
  const given = { code: 'given' } as SearchParameter;
  const family = { code: 'family' } as SearchParameter;
  const name = { code: 'name' } as SearchParameter;

  const usual: HumanName = { use: 'usual', given: ['AAAAA'], family: 'S5' };
  const official: HumanName = { use: 'official', given: ['AAAA'], family: 'S4' };
  const missing: HumanName = { use: 'invalid' as HumanName['use'], given: ['AAA'], family: 'S3' };
  const maiden: HumanName = { use: 'maiden', given: ['A'], family: 'S1' };
  test('usual preferred', () => {
    expect(getHumanNameSortValue([maiden, usual, official, missing], given)).toStrictEqual(formatGivenName(usual));
    expect(getHumanNameSortValue([maiden, usual, official, missing], family)).toStrictEqual(formatFamilyName(usual));
    expect(getHumanNameSortValue([maiden, usual, official, missing], name)).toStrictEqual(formatHumanName(usual));
  });

  test('missing over maiden', () => {
    expect(getHumanNameSortValue([maiden, missing], given)).toStrictEqual(formatGivenName(missing));
    expect(getHumanNameSortValue([maiden, missing], family)).toStrictEqual(formatFamilyName(missing));
    expect(getHumanNameSortValue([maiden, missing], name)).toStrictEqual(formatHumanName(missing));
  });
});

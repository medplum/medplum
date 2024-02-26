import { Operator } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { bundleContains, withTestContext } from '../../test.setup';
import { getSystemRepo } from '../repo';

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
      expect(searchResult.entry?.length).toEqual(1);
      expect(searchResult.entry?.[0]?.resource?.id).toEqual(patient.id);
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
      expect(searchResult.entry?.length).toEqual(1);
      expect(searchResult.entry?.[0]?.resource?.id).toEqual(patient.id);
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
      expect(searchResult.entry?.length).toEqual(2);
      expect(bundleContains(searchResult, patients[0])).toBe(true);
      expect(bundleContains(searchResult, patients[1])).toBe(true);
      expect(bundleContains(searchResult, patients[2])).toBe(false);
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
      expect(searchResult.entry?.length).toEqual(1);
      expect(searchResult.entry?.[0]?.resource?.id).toEqual(patient.id);

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
      expect(searchResult2.entry?.length).toEqual(1);
      expect(searchResult2.entry?.[0]?.resource?.id).toEqual(patient.id);
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
      expect(bundle2.entry?.length).toEqual(1);
      expect(bundle2.entry?.[0]?.resource?.id).toEqual(patient1.id);

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
      expect(bundle3.entry?.length).toEqual(0);

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
      expect(bundle5.entry?.length).toEqual(0);

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
      expect(bundle6.entry?.length).toEqual(1);
      expect(bundle6.entry?.[0]?.resource?.id).toEqual(patient1.id);
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
      expect(searchResult.entry?.length).toEqual(1);
      expect(searchResult.entry?.[0]?.resource?.id).toEqual(patient.id);
    }));
});

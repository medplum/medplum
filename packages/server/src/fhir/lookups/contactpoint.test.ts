import { Operator } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { loadTestConfig } from '../../config';
import { closeDatabase, initDatabase } from '../../database';
import { closeRedis, initRedis } from '../../redis';
import { seedDatabase } from '../../seed';
import { systemRepo } from '../repo';

describe('Address Lookup Table', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    initRedis(config.redis);
    await initDatabase(config.database);
    await seedDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
    closeRedis();
  });

  test('Patient resource with telecom', async () => {
    const email = randomUUID();
    const phone = randomUUID();

    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      telecom: [
        {
          system: 'email',
          value: email,
        },
        {
          system: 'phone',
          value: phone,
        },
      ],
    });

    const searchResult1 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'email',
          operator: Operator.CONTAINS,
          value: email,
        },
      ],
    });

    expect(searchResult1?.entry?.length).toEqual(1);
    expect(searchResult1?.entry?.[0]?.resource?.id).toEqual(patient?.id);

    const searchResult2 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'phone',
          operator: Operator.EQUALS,
          value: phone,
        },
      ],
    });

    expect(searchResult2?.entry?.length).toEqual(1);
    expect(searchResult2?.entry?.[0]?.resource?.id).toEqual(patient?.id);
  });

  test('Update telecome', async () => {
    const value1 = randomUUID();
    const value2 = randomUUID();

    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      telecom: [{ use: 'home', system: 'phone', value: value1 }],
    });

    const bundle2 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'telecom',
          operator: Operator.EQUALS,
          value: value1,
        },
      ],
    });
    expect(bundle2.entry?.length).toEqual(1);
    expect(bundle2.entry?.[0]?.resource?.id).toEqual(patient1.id);

    const bundle3 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'telecom',
          operator: Operator.EQUALS,
          value: value2,
        },
      ],
    });
    expect(bundle3.entry?.length).toEqual(0);

    await systemRepo.updateResource<Patient>({
      ...patient1,
      telecom: [{ use: 'home', system: 'phone', value: value2 }],
    });

    const bundle5 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'telecom',
          operator: Operator.EQUALS,
          value: value1,
        },
      ],
    });
    expect(bundle5.entry?.length).toEqual(0);

    const bundle6 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'telecom',
          operator: Operator.EQUALS,
          value: value2,
        },
      ],
    });
    expect(bundle6.entry?.length).toEqual(1);
    expect(bundle6.entry?.[0]?.resource?.id).toEqual(patient1.id);
  });
});

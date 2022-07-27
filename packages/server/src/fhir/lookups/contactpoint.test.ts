import { assertOk, Operator } from '@medplum/core';
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

    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
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

    expect(createOutcome.id).toEqual('created');

    const [searchOutcome1, searchResult1] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'email',
          operator: Operator.CONTAINS,
          value: email,
        },
      ],
    });

    expect(searchOutcome1.id).toEqual('ok');
    expect(searchResult1?.entry?.length).toEqual(1);
    expect(searchResult1?.entry?.[0]?.resource?.id).toEqual(patient?.id);

    const [searchOutcome2, searchResult2] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'phone',
          operator: Operator.EQUALS,
          value: phone,
        },
      ],
    });

    expect(searchOutcome2.id).toEqual('ok');
    expect(searchResult2?.entry?.length).toEqual(1);
    expect(searchResult2?.entry?.[0]?.resource?.id).toEqual(patient?.id);
  });

  test('Update telecome', async () => {
    const value1 = randomUUID();
    const value2 = randomUUID();

    const [outcome1, patient1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      telecom: [{ use: 'home', system: 'phone', value: value1 }],
    });
    assertOk(outcome1, patient1);

    const [outcome2, bundle2] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'telecom',
          operator: Operator.EQUALS,
          value: value1,
        },
      ],
    });
    assertOk(outcome2, bundle2);
    expect(bundle2.entry?.length).toEqual(1);
    expect(bundle2.entry?.[0]?.resource?.id).toEqual(patient1.id);

    const [outcome3, bundle3] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'telecom',
          operator: Operator.EQUALS,
          value: value2,
        },
      ],
    });
    assertOk(outcome3, bundle3);
    expect(bundle3.entry?.length).toEqual(0);

    const [outcome4, patient4] = await systemRepo.updateResource<Patient>({
      ...patient1,
      telecom: [{ use: 'home', system: 'phone', value: value2 }],
    });
    assertOk(outcome4, patient4);

    const [outcome5, bundle5] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'telecom',
          operator: Operator.EQUALS,
          value: value1,
        },
      ],
    });
    assertOk(outcome5, bundle5);
    expect(bundle5.entry?.length).toEqual(0);

    const [outcome6, bundle6] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'telecom',
          operator: Operator.EQUALS,
          value: value2,
        },
      ],
    });
    assertOk(outcome6, bundle6);
    expect(bundle6.entry?.length).toEqual(1);
    expect(bundle6.entry?.[0]?.resource?.id).toEqual(patient1.id);
  });
});

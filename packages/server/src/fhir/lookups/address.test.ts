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

  test('Patient resource with address', async () => {
    const addressLine = randomUUID();
    const addressCity = randomUUID();

    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      address: [
        {
          use: 'both',
          line: [addressLine],
          city: addressCity,
          state: 'CA',
          postalCode: '94111',
          country: 'US',
        },
      ],
    });
    assertOk(createOutcome, patient);

    const [searchOutcome1, searchResult1] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'address',
          operator: Operator.CONTAINS,
          value: addressLine,
        },
      ],
    });
    assertOk(searchOutcome1, searchResult1);
    expect(searchResult1.entry?.length).toEqual(1);
    expect(searchResult1.entry?.[0]?.resource?.id).toEqual(patient.id);

    const [searchOutcome2, searchResult2] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'address-city',
          operator: Operator.EQUALS,
          value: addressCity,
        },
      ],
    });
    assertOk(searchOutcome2, searchResult2);
    expect(searchResult2.entry?.length).toEqual(1);
    expect(searchResult2.entry?.[0]?.resource?.id).toEqual(patient.id);
  });

  test('Multiple addresses', async () => {
    const address = randomUUID();
    const other = randomUUID();

    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      address: [
        { use: 'home', line: [address] },
        { use: 'home', line: [other] },
      ],
    });
    assertOk(createOutcome, patient);

    const [searchOutcome, searchResult] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'address',
          operator: Operator.EQUALS,
          value: address,
        },
      ],
    });
    assertOk(searchOutcome, searchResult);
    expect(searchResult.entry?.length).toEqual(1);
    expect(searchResult.entry?.[0]?.resource?.id).toEqual(patient.id);

    const [searchOutcome2, searchResult2] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'address',
          operator: Operator.EQUALS,
          value: other,
        },
      ],
    });
    assertOk(searchOutcome2, searchResult2);
    expect(searchResult2.entry?.length).toEqual(1);
    expect(searchResult2.entry?.[0]?.resource?.id).toEqual(patient.id);
  });

  test('Update address', async () => {
    const address1 = randomUUID();
    const address2 = randomUUID();

    const [outcome1, patient1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      address: [{ use: 'home', line: [address1] }],
    });
    assertOk(outcome1, patient1);

    const [outcome2, bundle2] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'address',
          operator: Operator.EQUALS,
          value: address1,
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
          code: 'address',
          operator: Operator.EQUALS,
          value: address2,
        },
      ],
    });
    assertOk(outcome3, bundle3);
    expect(bundle3.entry?.length).toEqual(0);

    const [outcome4, patient4] = await systemRepo.updateResource<Patient>({
      ...patient1,
      address: [{ use: 'home', line: [address2] }],
    });
    assertOk(outcome4, patient4);

    const [outcome5, bundle5] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'address',
          operator: Operator.EQUALS,
          value: address1,
        },
      ],
    });
    assertOk(outcome5, bundle5);
    expect(bundle5.entry?.length).toEqual(0);

    const [outcome6, bundle6] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'address',
          operator: Operator.EQUALS,
          value: address2,
        },
      ],
    });
    assertOk(outcome6, bundle6);
    expect(bundle6.entry?.length).toEqual(1);
    expect(bundle6.entry?.[0]?.resource?.id).toEqual(patient1.id);
  });
});

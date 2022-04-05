import { assertOk, Operator } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { loadTestConfig } from '../../config';
import { closeDatabase, initDatabase } from '../../database';
import { bundleContains } from '../../jest.setup';
import { seedDatabase } from '../../seed';
import { systemRepo } from '../repo';

describe('Identifier Lookup Table', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Identifier', async () => {
    const identifier = randomUUID();

    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [{ system: 'https://www.example.com', value: identifier }],
    });
    assertOk(createOutcome, patient);

    const [searchOutcome, searchResult] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier,
        },
      ],
    });
    assertOk(searchOutcome, searchResult);
    expect(searchResult.entry?.length).toEqual(1);
    expect(searchResult.entry?.[0]?.resource?.id).toEqual(patient?.id);
  });

  test('Multiple identifiers', async () => {
    const identifier = randomUUID();
    const other = randomUUID();

    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [
        { system: 'https://www.example.com', value: identifier },
        { system: 'https://www.example.com', value: identifier },
        { system: 'other', value: other },
      ],
    });
    assertOk(createOutcome, patient);

    const [searchOutcome, searchResult] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier,
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
          code: 'identifier',
          operator: Operator.EQUALS,
          value: other,
        },
      ],
    });
    assertOk(searchOutcome2, searchResult2);
    expect(searchResult2.entry?.length).toEqual(1);
    expect(searchResult2.entry?.[0]?.resource?.id).toEqual(patient.id);
  });

  test('Update identifier', async () => {
    const identifier1 = randomUUID();
    const identifier2 = randomUUID();

    const [outcome1, patient1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [{ system: 'https://www.example.com', value: identifier1 }],
    });
    assertOk(outcome1, patient1);

    const [outcome2, bundle2] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier1,
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
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier2,
        },
      ],
    });
    assertOk(outcome3, bundle3);
    expect(bundle3.entry?.length).toEqual(0);

    const [outcome4, patient4] = await systemRepo.updateResource<Patient>({
      ...patient1,
      identifier: [{ system: 'https://www.example.com', value: identifier2 }],
    });
    assertOk(outcome4, patient4);

    const [outcome5, bundle5] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier1,
        },
      ],
    });
    assertOk(outcome5, bundle5);
    expect(bundle5.entry?.length).toEqual(0);

    const [outcome6, bundle6] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier2,
        },
      ],
    });
    assertOk(outcome6, bundle6);
    expect(bundle6.entry?.length).toEqual(1);
    expect(bundle6.entry?.[0]?.resource?.id).toEqual(patient1.id);
  });

  test('Search identifier exact', async () => {
    const identifier = randomUUID();

    const [createOutcome1, patient1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [{ system: 'https://www.example.com', value: identifier }],
    });
    assertOk(createOutcome1, patient1);

    const [createOutcome2, patient2] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Jones' }],
      identifier: [{ system: 'https://www.example.com', value: identifier + 'xyz' }],
    });
    assertOk(createOutcome2, patient2);

    const [searchOutcome1, searchResult1] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EXACT,
          value: identifier,
        },
      ],
    });
    assertOk(searchOutcome1, searchResult1);
    expect(searchResult1?.entry?.length).toEqual(1);
    expect(bundleContains(searchResult1, patient1)).toBe(true);
    expect(bundleContains(searchResult1, patient2)).toBe(false);
  });

  test('Search comma separated identifier exact', async () => {
    const identifier1 = randomUUID();
    const identifier2 = randomUUID();

    const [createOutcome1, patient1] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [{ system: 'https://www.example.com', value: identifier1 }],
    });
    assertOk(createOutcome1, patient1);

    const [createOutcome2, patient2] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Jones' }],
      identifier: [{ system: 'https://www.example.com', value: identifier2 }],
    });
    assertOk(createOutcome2, patient2);

    const [searchOutcome1, searchResult1] = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EXACT,
          value: `${identifier1},${identifier2}`,
        },
      ],
    });
    assertOk(searchOutcome1, searchResult1);
    expect(searchResult1?.entry?.length).toEqual(2);
    expect(bundleContains(searchResult1, patient1)).toBe(true);
    expect(bundleContains(searchResult1, patient2)).toBe(true);
  });
});

import { Operator } from '@medplum/core';
import { Patient, ServiceRequest, SpecimenDefinition } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { bundleContains } from '../../test.setup';
import { systemRepo } from '../repo';

describe('Identifier Lookup Table', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Identifier', async () => {
    const identifier = randomUUID();

    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [{ system: 'https://www.example.com', value: identifier }],
    });

    const searchResult = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier,
        },
      ],
    });
    expect(searchResult.entry?.length).toEqual(1);
    expect(searchResult.entry?.[0]?.resource?.id).toEqual(patient?.id);
  });

  test('Multiple identifiers', async () => {
    const identifier = randomUUID();
    const other = randomUUID();

    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [
        { system: 'https://www.example.com', value: identifier },
        { system: 'https://www.example.com', value: identifier },
        { system: 'other', value: other },
      ],
    });

    const searchResult = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier,
        },
      ],
    });
    expect(searchResult.entry?.length).toEqual(1);
    expect(searchResult.entry?.[0]?.resource?.id).toEqual(patient.id);

    const searchResult2 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: other,
        },
      ],
    });
    expect(searchResult2.entry?.length).toEqual(1);
    expect(searchResult2.entry?.[0]?.resource?.id).toEqual(patient.id);
  });

  test('Update identifier', async () => {
    const identifier1 = randomUUID();
    const identifier2 = randomUUID();

    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [{ system: 'https://www.example.com', value: identifier1 }],
    });

    const bundle2 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier1,
        },
      ],
    });
    expect(bundle2.entry?.length).toEqual(1);
    expect(bundle2.entry?.[0]?.resource?.id).toEqual(patient1.id);

    const bundle3 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier2,
        },
      ],
    });
    expect(bundle3.entry?.length).toEqual(0);

    await systemRepo.updateResource<Patient>({
      ...patient1,
      identifier: [{ system: 'https://www.example.com', value: identifier2 }],
    });

    const bundle5 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier1,
        },
      ],
    });
    expect(bundle5.entry?.length).toEqual(0);

    const bundle6 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier2,
        },
      ],
    });
    expect(bundle6.entry?.length).toEqual(1);
    expect(bundle6.entry?.[0]?.resource?.id).toEqual(patient1.id);
  });

  test('Implicit exact', async () => {
    const identifier = randomUUID();

    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [{ system: 'https://www.example.com', value: identifier }],
    });

    const patient2 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Jones' }],
      identifier: [{ system: 'https://www.example.com', value: identifier + 'xyz' }],
    });

    const searchResult1 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier,
        },
      ],
    });
    expect(searchResult1?.entry?.length).toEqual(1);
    expect(bundleContains(searchResult1, patient1)).toBe(true);
    expect(bundleContains(searchResult1, patient2)).toBe(false);
  });

  test('Explicit exact', async () => {
    const identifier = randomUUID();

    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [{ system: 'https://www.example.com', value: identifier }],
    });

    const patient2 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Jones' }],
      identifier: [{ system: 'https://www.example.com', value: identifier + 'xyz' }],
    });

    const searchResult1 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EXACT,
          value: identifier,
        },
      ],
    });
    expect(searchResult1?.entry?.length).toEqual(1);
    expect(bundleContains(searchResult1, patient1)).toBe(true);
    expect(bundleContains(searchResult1, patient2)).toBe(false);
  });

  test('Contains', async () => {
    const identifier = randomUUID();

    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [{ system: 'https://www.example.com', value: identifier }],
    });

    const patient2 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Jones' }],
      identifier: [{ system: 'https://www.example.com', value: identifier + 'xyz' }],
    });

    const searchResult1 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.CONTAINS,
          value: identifier,
        },
      ],
    });
    expect(searchResult1?.entry?.length).toEqual(2);
    expect(bundleContains(searchResult1, patient1)).toBe(true);
    expect(bundleContains(searchResult1, patient2)).toBe(true);
  });

  test('Not equals', async () => {
    const identifier = randomUUID();
    const name = randomUUID();

    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: name }],
      identifier: [{ system: 'https://www.example.com', value: identifier }],
    });

    const patient2 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: name }],
      identifier: [{ system: 'https://www.example.com', value: identifier + 'xyz' }],
    });

    const searchResult1 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.NOT_EQUALS,
          value: identifier,
        },
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: name,
        },
      ],
    });
    expect(searchResult1?.entry?.length).toEqual(1);
    expect(bundleContains(searchResult1, patient1)).toBe(false);
    expect(bundleContains(searchResult1, patient2)).toBe(true);
  });

  test('Search comma separated identifier exact', async () => {
    const identifier1 = randomUUID();
    const identifier2 = randomUUID();

    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [{ system: 'https://www.example.com', value: identifier1 }],
    });

    const patient2 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Jones' }],
      identifier: [{ system: 'https://www.example.com', value: identifier2 }],
    });

    const searchResult1 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EXACT,
          value: `${identifier1},${identifier2}`,
        },
      ],
    });
    expect(searchResult1?.entry?.length).toEqual(2);
    expect(bundleContains(searchResult1, patient1)).toBe(true);
    expect(bundleContains(searchResult1, patient2)).toBe(true);
  });

  test('Search on system', async () => {
    const system1 = 'https://foo.com';
    const system2 = 'https://bar.com';
    const identifier = randomUUID();

    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [{ system: system1, value: identifier }],
    });

    const patient2 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Jones' }],
      identifier: [{ system: system2, value: identifier }],
    });

    const searchResult1 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EXACT,
          value: system1 + '|' + identifier,
        },
      ],
    });
    expect(searchResult1?.entry?.length).toEqual(1);
    expect(bundleContains(searchResult1, patient1)).toBe(true);
    expect(bundleContains(searchResult1, patient2)).toBe(false);

    const searchResult2 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EXACT,
          value: system2 + '|' + identifier,
        },
      ],
    });
    expect(searchResult2?.entry?.length).toEqual(1);
    expect(bundleContains(searchResult2, patient1)).toBe(false);
    expect(bundleContains(searchResult2, patient2)).toBe(true);
  });

  test('Non-array identifier', async () => {
    const identifier = randomUUID();

    const resource = await systemRepo.createResource<SpecimenDefinition>({
      resourceType: 'SpecimenDefinition',
      identifier: { system: 'https://www.example.com', value: identifier },
    });

    const searchResult = await systemRepo.search({
      resourceType: 'SpecimenDefinition',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier,
        },
      ],
    });
    expect(searchResult.entry?.length).toEqual(1);
    expect(searchResult.entry?.[0]?.resource?.id).toEqual(resource?.id);
  });

  test('Leading whitespace', async () => {
    const identifier = randomUUID();

    const resource = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      identifier: [{ system: 'https://www.example.com', value: ' ' + identifier }],
    });

    const searchResult = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier,
        },
      ],
    });
    expect(searchResult.entry?.length).toEqual(1);
    expect(searchResult.entry?.[0]?.resource?.id).toEqual(resource?.id);
  });

  test('CodeableConcept text', async () => {
    const sr1 = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      intent: 'order',
      status: 'active',
      subject: { reference: 'Patient/1' },
      category: [{ text: randomUUID() }],
    });

    const sr2 = await systemRepo.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      intent: 'order',
      status: 'active',
      subject: { reference: 'Patient/1' },
      category: [{ text: randomUUID() }],
    });

    const searchResult1 = await systemRepo.search({
      resourceType: 'ServiceRequest',
      filters: [
        {
          code: 'category',
          operator: Operator.EQUALS,
          value: sr1.category?.[0]?.text as string,
        },
      ],
    });
    expect(searchResult1?.entry?.length).toEqual(1);
    expect(bundleContains(searchResult1, sr1)).toBe(true);
    expect(bundleContains(searchResult1, sr2)).toBe(false);
  });
});

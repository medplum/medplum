import { Operator } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { systemRepo } from '../repo';

describe('Address Lookup Table', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Patient resource with address', async () => {
    const addressLine = randomUUID();
    const addressCity = randomUUID();

    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      address: [
        {
          use: 'home',
          line: [addressLine],
          city: addressCity,
          state: 'CA',
          postalCode: '94111',
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
    expect(searchResult1.entry?.length).toEqual(1);
    expect(searchResult1.entry?.[0]?.resource?.id).toEqual(patient.id);

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
    expect(searchResult2.entry?.length).toEqual(1);
    expect(searchResult2.entry?.[0]?.resource?.id).toEqual(patient.id);
  });

  test('Multiple addresses', async () => {
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
    expect(searchResult.entry?.length).toEqual(1);
    expect(searchResult.entry?.[0]?.resource?.id).toEqual(patient.id);

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
    expect(searchResult2.entry?.length).toEqual(1);
    expect(searchResult2.entry?.[0]?.resource?.id).toEqual(patient.id);
  });

  test('Update address', async () => {
    const address1 = randomUUID();
    const address2 = randomUUID();

    const patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      address: [{ use: 'home', line: [address1] }],
    });

    const bundle2 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'address',
          operator: Operator.EQUALS,
          value: address1,
        },
      ],
    });
    expect(bundle2.entry?.length).toEqual(1);
    expect(bundle2.entry?.[0]?.resource?.id).toEqual(patient1.id);

    const bundle3 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'address',
          operator: Operator.EQUALS,
          value: address2,
        },
      ],
    });
    expect(bundle3.entry?.length).toEqual(0);

    await systemRepo.updateResource<Patient>({
      ...patient1,
      address: [{ use: 'home', line: [address2] }],
    });

    const bundle5 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'address',
          operator: Operator.EQUALS,
          value: address1,
        },
      ],
    });
    expect(bundle5.entry?.length).toEqual(0);

    const bundle6 = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'address',
          operator: Operator.EQUALS,
          value: address2,
        },
      ],
    });
    expect(bundle6.entry?.length).toEqual(1);
    expect(bundle6.entry?.[0]?.resource?.id).toEqual(patient1.id);
  });
});

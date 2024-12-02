import { Operator } from '@medplum/core';
import { InsurancePlan, Patient, Location, ResourceType, Resource } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { withTestContext } from '../../test.setup';
import { getSystemRepo } from '../repo';

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
});

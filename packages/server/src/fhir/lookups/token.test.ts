import { Operator } from '@medplum/core';
import { Patient, ServiceRequest, SpecimenDefinition } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { bundleContains, withTestContext } from '../../test.setup';
import { systemRepo, shouldCompareTokenValue, shouldTokenRowExist } from '../repo';

describe('Identifier Lookup Table', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Identifier', () =>
    withTestContext(async () => {
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
      expect(searchResult.entry?.[0]?.resource?.id).toEqual(patient.id);
    }));

  test('Multiple identifiers', () =>
    withTestContext(async () => {
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
    }));

  test('Update identifier', () =>
    withTestContext(async () => {
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
    }));

  test('Implicit exact', () =>
    withTestContext(async () => {
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
      expect(searchResult1.entry?.length).toEqual(1);
      expect(bundleContains(searchResult1, patient1)).toBe(true);
      expect(bundleContains(searchResult1, patient2)).toBe(false);
    }));

  test('Explicit exact', () =>
    withTestContext(async () => {
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
      expect(searchResult1.entry?.length).toEqual(1);
      expect(bundleContains(searchResult1, patient1)).toBe(true);
      expect(bundleContains(searchResult1, patient2)).toBe(false);
    }));

  test('Contains', () =>
    withTestContext(async () => {
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
      expect(searchResult1.entry?.length).toEqual(2);
      expect(bundleContains(searchResult1, patient1)).toBe(true);
      expect(bundleContains(searchResult1, patient2)).toBe(true);
    }));

  test('Not equals', () =>
    withTestContext(async () => {
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
      expect(searchResult1.entry?.length).toEqual(1);
      expect(bundleContains(searchResult1, patient1)).toBe(false);
      expect(bundleContains(searchResult1, patient2)).toBe(true);
    }));

  test('Missing', () =>
    withTestContext(async () => {
      const identifier = randomUUID();
      const name = randomUUID();

      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: name }],
      });

      const patient2 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Bob'], family: name }],
        telecom: [{ system: 'email', value: identifier + 'xyz' }],
      });

      const searchResult1 = await systemRepo.search({
+  test('Missing scenario test', () =>
+    withTestContext(async () => {
+      const identifier = randomUUID();
+      const name = randomUUID();
+
+      const patient1 = await systemRepo.createResource<Patient>({
+        resourceType: 'Patient',
+        name: [{ given: ['Alice'], family: name }],
+      });
+
+      const patient2 = await systemRepo.createResource<Patient>({
+        resourceType: 'Patient',
+        name: [{ given: ['Bob'], family: name }],
+        telecom: [{ system: 'email', value: identifier + 'xyz' }],
+      });
+
+      const searchResult1 = await systemRepo.search({
+        resourceType: 'Patient',
+        filters: [
+          {
+            code: 'identifier',
+            operator: Operator.MISSING,
+            value: 'true',
+          },
+          {
+            code: 'name',
+            operator: Operator.EQUALS,
+            value: name,
+          },
+        ],
+      });
+      expect(searchResult1.entry?.length).toEqual(1);
+      expect(bundleContains(searchResult1, patient1)).toBe(true);
+      expect(bundleContains(searchResult1, patient2)).toBe(false);
+    }));
        resourceType: 'Patient',
        filters: [
          {
            code: 'email',
            operator: Operator.MISSING,
            value: 'true',
          },
          {
            code: 'name',
            operator: Operator.EQUALS,
            value: name,
          },
        ],
      });
      expect(searchResult1.entry?.length).toEqual(1);
      expect(bundleContains(searchResult1, patient1)).toBe(true);
      expect(bundleContains(searchResult1, patient2)).toBe(false);
    }));

  test('Search comma separated identifier exact', () =>
    withTestContext(async () => {
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
      expect(searchResult1.entry?.length).toEqual(2);
      expect(bundleContains(searchResult1, patient1)).toBe(true);
      expect(bundleContains(searchResult1, patient2)).toBe(true);
    }));

  test('Search on system', () =>
    withTestContext(async () => {
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
      expect(searchResult1.entry?.length).toEqual(1);
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
      expect(searchResult2.entry?.length).toEqual(1);
      expect(bundleContains(searchResult2, patient1)).toBe(false);
      expect(bundleContains(searchResult2, patient2)).toBe(true);
    }));

  test('Non-array identifier', () =>
    withTestContext(async () => {
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
      expect(searchResult.entry?.[0]?.resource?.id).toEqual(resource.id);
    }));

  test('Leading whitespace', () =>
    withTestContext(async () => {
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
      expect(searchResult.entry?.[0]?.resource?.id).toEqual(resource.id);
    }));

  test('CodeableConcept text', () =>
    withTestContext(async () => {
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
      expect(searchResult1.entry?.length).toEqual(1);
      expect(bundleContains(searchResult1, sr1)).toBe(true);
      expect(bundleContains(searchResult1, sr2)).toBe(false);
    }));
});
describe('shouldCompareTokenValue function', () => {
  test('should return true when both values are equal', () => {
    expect(shouldCompareTokenValue('test', 'test')).toBe(true);
  });

  test('should return false when values are not equal', () => {
    expect(shouldCompareTokenValue('test', 'test1')).toBe(false);
  });

  test('should return true when both values are undefined', () => {
    expect(shouldCompareTokenValue(undefined, undefined)).toBe(true);
  });

  test('should return false when one value is undefined', () => {
    expect(shouldCompareTokenValue('test', undefined)).toBe(false);
    expect(shouldCompareTokenValue(undefined, 'test')).toBe(false);
  });
});

describe('shouldTokenRowExist function', () => {
  test('should return true when token row exists', () => {
    const tokenRow = { code: 'test', system: 'test', value: 'test' };
    expect(shouldTokenRowExist(tokenRow)).toBe(true);
  });

  test('should return false when token row does not exist', () => {
    const tokenRow = { code: 'test', system: 'test', value: undefined };
    expect(shouldTokenRowExist(tokenRow)).toBe(false);
  });

  test('should return false when token row is undefined', () => {
    expect(shouldTokenRowExist(undefined)).toBe(false);
  });
});

import { createReference, Operator } from '@medplum/core';
import { Condition, Patient, ServiceRequest, SpecimenDefinition } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig, MedplumServerConfig } from '../../config';
import { bundleContains, createTestProject, withTestContext } from '../../test.setup';
import { getSystemRepo, Repository } from '../repo';

describe('Identifier Lookup Table', () => {
  let config: MedplumServerConfig;
  const systemRepo = getSystemRepo();

  beforeAll(async () => {
    config = await loadTestConfig();
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
      expect(searchResult.entry?.length).toStrictEqual(1);
      expect(searchResult.entry?.[0]?.resource?.id).toStrictEqual(patient.id);
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
      expect(searchResult.entry?.length).toStrictEqual(1);
      expect(searchResult.entry?.[0]?.resource?.id).toStrictEqual(patient.id);

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
      expect(searchResult2.entry?.length).toStrictEqual(1);
      expect(searchResult2.entry?.[0]?.resource?.id).toStrictEqual(patient.id);
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
      expect(bundle2.entry?.length).toStrictEqual(1);
      expect(bundle2.entry?.[0]?.resource?.id).toStrictEqual(patient1.id);

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
      expect(bundle3.entry?.length).toStrictEqual(0);

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
      expect(bundle5.entry?.length).toStrictEqual(0);

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
      expect(bundle6.entry?.length).toStrictEqual(1);
      expect(bundle6.entry?.[0]?.resource?.id).toStrictEqual(patient1.id);
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
      expect(searchResult1.entry?.length).toStrictEqual(1);
      expect(bundleContains(searchResult1, patient1)).toBeDefined();
      expect(bundleContains(searchResult1, patient2)).toBeUndefined();
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
      expect(searchResult1.entry?.length).toStrictEqual(1);
      expect(bundleContains(searchResult1, patient1)).toBeDefined();
      expect(bundleContains(searchResult1, patient2)).toBeUndefined();
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
      expect(searchResult1.entry?.length).toStrictEqual(2);
      expect(bundleContains(searchResult1, patient1)).toBeDefined();
      expect(bundleContains(searchResult1, patient2)).toBeDefined();
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
      expect(searchResult1.entry?.length).toStrictEqual(1);
      expect(bundleContains(searchResult1, patient1)).toBeUndefined();
      expect(bundleContains(searchResult1, patient2)).toBeDefined();
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
      expect(searchResult1.entry?.length).toStrictEqual(1);
      expect(bundleContains(searchResult1, patient1)).toBeDefined();
      expect(bundleContains(searchResult1, patient2)).toBeUndefined();
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
      expect(searchResult1.entry?.length).toStrictEqual(2);
      expect(bundleContains(searchResult1, patient1)).toBeDefined();
      expect(bundleContains(searchResult1, patient2)).toBeDefined();
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
      expect(searchResult1.entry?.length).toStrictEqual(1);
      expect(bundleContains(searchResult1, patient1)).toBeDefined();
      expect(bundleContains(searchResult1, patient2)).toBeUndefined();

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
      expect(searchResult2.entry?.length).toStrictEqual(1);
      expect(bundleContains(searchResult2, patient1)).toBeUndefined();
      expect(bundleContains(searchResult2, patient2)).toBeDefined();
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
      expect(searchResult.entry?.length).toStrictEqual(1);
      expect(searchResult.entry?.[0]?.resource?.id).toStrictEqual(resource.id);
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
      expect(searchResult.entry?.length).toStrictEqual(1);
      expect(searchResult.entry?.[0]?.resource?.id).toStrictEqual(resource.id);
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
      expect(searchResult1.entry?.length).toStrictEqual(1);
      expect(bundleContains(searchResult1, sr1)).toBeDefined();
      expect(bundleContains(searchResult1, sr2)).toBeUndefined();
    }));

  test('Identifier value with pipe', () =>
    withTestContext(async () => {
      const system = randomUUID();
      const base = randomUUID();
      const id1 = base + '|1';
      const id2 = base + '|2';

      const p1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        identifier: [{ system, value: id1 }],
      });

      await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        identifier: [{ system, value: id2 }],
      });

      const r1 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [{ code: 'identifier', operator: Operator.EQUALS, value: `${system}|${id1}` }],
      });
      expect(r1.entry?.length).toStrictEqual(1);
      expect(r1.entry?.[0]?.resource?.id).toStrictEqual(p1.id);
    }));

  test('Missing/present', () =>
    withTestContext(async () => {
      const family = randomUUID();

      const p1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family }],
      });

      const p2 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family }],
        identifier: [{ system: 'https://www.example.com', value: randomUUID() }],
      });

      const r1 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          { code: 'name', operator: Operator.EQUALS, value: family },
          { code: 'identifier', operator: Operator.MISSING, value: 'true' },
        ],
      });
      expect(r1.entry?.length).toStrictEqual(1);
      expect(r1.entry?.[0]?.resource?.id).toStrictEqual(p1.id);

      const r2 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          { code: 'name', operator: Operator.EQUALS, value: family },
          { code: 'identifier', operator: Operator.MISSING, value: 'false' },
        ],
      });
      expect(r2.entry?.length).toStrictEqual(1);
      expect(r2.entry?.[0]?.resource?.id).toStrictEqual(p2.id);

      const r3 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          { code: 'name', operator: Operator.EQUALS, value: family },
          { code: 'identifier', operator: Operator.PRESENT, value: 'true' },
        ],
      });
      expect(r3.entry?.length).toStrictEqual(1);
      expect(r3.entry?.[0]?.resource?.id).toStrictEqual(p2.id);

      const r4 = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          { code: 'name', operator: Operator.EQUALS, value: family },
          { code: 'identifier', operator: Operator.PRESENT, value: 'false' },
        ],
      });
      expect(r4.entry?.length).toStrictEqual(1);
      expect(r4.entry?.[0]?.resource?.id).toStrictEqual(p1.id);
    }));

  describe('Nitty gritty tests', () => {
    let repo: Repository;

    let patient: Patient;

    const conditionNames = [
      'noCodeNoCat',
      'noCodeCatOne',
      'codeOneNoCat',
      'codeOneCatOne',
      'codeOneCatTwo',
      'codeOneWithoutSystemNoCat',
      'codeTwoWithoutSystemCatTwo',
    ] as const;
    type Conditions = (typeof conditionNames)[number];
    const cond: Record<Conditions, Condition & { id: string }> = {} as Record<Conditions, Condition & { id: string }>;

    const sys1 = 'http://sys.one';
    const sys2 = 'http://sys.two';

    const val1 = 'ABCDEFGHIJ';
    const val2 = '0123456789';

    const disp1 = 'The Quick Brown Fox';

    beforeAll(async () => {
      const { project } = await createTestProject();
      repo = new Repository({
        strictMode: true,
        projects: [project.id as string],
        author: { reference: 'User/' + randomUUID() },
      });

      patient = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ given: ['Henry'] }] });
      const subject = createReference(patient);

      const partial = cond as Record<string, Condition>;
      partial.noCodeNoCat = await repo.createResource<Condition>({
        resourceType: 'Condition',
        subject,
        identifier: [{ value: 'noCodeNoCat' }],
      });
      partial.noCodeCatOne = await repo.createResource<Condition>({
        resourceType: 'Condition',
        subject,
        identifier: [{ value: 'noCodeCatOne' }],
        category: [{ coding: [{ system: sys1, code: val1, display: disp1 }] }],
      });
      partial.codeOneNoCat = await repo.createResource<Condition>({
        resourceType: 'Condition',
        subject,
        identifier: [{ value: 'codeOneNoCat' }],
        code: { coding: [{ system: sys1, code: val1, display: disp1 }] },
      });
      partial.codeOneCatOne = await repo.createResource<Condition>({
        resourceType: 'Condition',
        subject,
        identifier: [{ value: 'codeOneCatOne' }],
        code: { coding: [{ system: sys1, code: val1 }] },
        category: [{ coding: [{ system: sys1, code: val1 }] }],
      });
      partial.codeOneCatTwo = await repo.createResource<Condition>({
        resourceType: 'Condition',
        subject,
        identifier: [{ value: 'codeOneCatTwo' }],
        code: { coding: [{ system: sys1, code: val1 }] },
        category: [{ coding: [{ system: sys2, code: val2 }] }],
      });
      partial.codeOneWithoutSystemNoCat = await repo.createResource<Condition>({
        resourceType: 'Condition',
        subject,
        identifier: [{ value: 'codeOneWithoutSystemNoCat' }],
        code: { coding: [{ code: val1 }] },
      });
      partial.codeTwoWithoutSystemCatTwo = await repo.createResource<Condition>({
        resourceType: 'Condition',
        subject,
        identifier: [{ value: 'codeTwoWithoutSystemCatTwo' }],
        code: { coding: [{ code: val2 }] },
        category: [{ coding: [{ system: sys2, code: val2 }] }],
      });

      for (const name of conditionNames) {
        if (!cond[name]?.id) {
          throw new Error('Condition "' + name + '" not created');
        }
        expect(cond[name].identifier?.[0].value).toEqual(name);
      }
      expect(Object.keys(cond)).toHaveLength(conditionNames.length);
    });

    test.each<[string, Conditions[]]>([
      [sys1, ['codeOneNoCat', 'codeOneCatOne', 'codeOneCatTwo']],
      [sys2, []],
      [val1, []], // incorrectly passing val as a system
      // ['', []],
    ])('code by system %s', async (value, expected) => {
      const res = await repo.search<Condition>({
        resourceType: 'Condition',
        filters: [
          {
            code: 'code',
            operator: Operator.EQUALS,
            value: value + '|',
          },
        ],
      });
      expect(res.entry?.map((e) => e.resource?.identifier?.[0].value)).toEqual(expected);
    });

    test.each<[string, Conditions[]]>([
      [sys1, []], // incorrectly passing sys as a value
      [val1, ['codeOneNoCat', 'codeOneCatOne', 'codeOneCatTwo', 'codeOneWithoutSystemNoCat']],
      [val2, ['codeTwoWithoutSystemCatTwo']],
    ])('code by value %s', async (value, expected) => {
      const resEquals = await repo.search<Condition>({
        resourceType: 'Condition',
        filters: [
          {
            code: 'code',
            operator: Operator.EQUALS,
            value,
          },
        ],
      });
      expect(resEquals.entry?.map((e) => e.resource?.identifier?.[0].value)).toEqual(expected);

      const resContains = await repo.search<Condition>({
        resourceType: 'Condition',
        filters: [
          {
            code: 'code',
            operator: Operator.CONTAINS,
            value,
          },
        ],
      });
      expect(resContains.entry?.map((e) => e.resource?.identifier?.[0].value)).toEqual(expected);
    });

    test.each<[string, string, Conditions[]]>([
      [sys1, val1, ['codeOneNoCat', 'codeOneCatOne', 'codeOneCatTwo']],
      [sys1, val2, []],
      [sys2, val1, []],
      [sys2, val2, []],
    ])('code by system and value %s|%s', async (system, value, expected) => {
      const res = await repo.search<Condition>({
        resourceType: 'Condition',
        filters: [
          {
            code: 'code',
            operator: Operator.EQUALS,
            value: system + '|' + value,
          },
        ],
      });
      expect(res.entry?.map((e) => e.resource?.identifier?.[0].value)).toEqual(expected);
    });

    test.each<[string, Conditions[]]>([
      [val1, ['codeOneWithoutSystemNoCat']],
      // [val2, ['codeTwoWithoutSystemCatTwo']],
    ])('code by missing system and value %s', async (value, expected) => {
      const res = await repo.search<Condition>({
        resourceType: 'Condition',
        filters: [
          {
            code: 'code',
            operator: Operator.EQUALS,
            value: '|' + value,
          },
        ],
      });
      expect(res.entry?.map((e) => e.resource?.identifier?.[0].value)).toEqual(expected);
    });

    test.each<[string, string, Conditions[]]>([
      [val1, val1, ['codeOneCatOne']],
      [val1, val2, ['codeOneCatTwo']],
      [val2, val1, []],
      [sys1 + '|', val2, ['codeOneCatTwo']],
      ['|' + val1, val1, []],
      ['|' + val2, sys2 + '|' + val2, ['codeTwoWithoutSystemCatTwo']],
    ])('code and category by code=%s category=%s', async (codeValue, categoryValue, expected) => {
      const res = await repo.search<Condition>({
        resourceType: 'Condition',
        filters: [
          {
            code: 'code',
            operator: Operator.EQUALS,
            value: codeValue,
          },
          {
            code: 'category',
            operator: Operator.EQUALS,
            value: categoryValue,
          },
        ],
      });
      expect(res.entry?.map((e) => e.resource?.identifier?.[0].value)).toEqual(expected);
    });

    test.each<[string, Conditions[]]>([
      [val1, ['codeOneNoCat', 'codeOneCatOne', 'codeOneCatTwo', 'codeOneWithoutSystemNoCat']],
      [val1.slice(0, 3), ['codeOneNoCat', 'codeOneCatOne', 'codeOneCatTwo', 'codeOneWithoutSystemNoCat']],
    ])('code :contains beginning of value %s', async (value, expected) => {
      const resContains = await repo.search<Condition>({
        resourceType: 'Condition',
        filters: [
          {
            code: 'code',
            operator: Operator.CONTAINS,
            value,
          },
        ],
      });
      expect(resContains.entry?.map((e) => e.resource?.identifier?.[0].value)).toEqual(expected);
    });

    test.each<[string, Conditions[]]>([
      [val1.slice(1, 3), ['codeOneNoCat', 'codeOneCatOne', 'codeOneCatTwo', 'codeOneWithoutSystemNoCat']],
      [val2.slice(1, 3), ['codeTwoWithoutSystemCatTwo']],
    ])('code :contains middle of value %s', async (value, expected) => {
      const resContains = await repo.search<Condition>({
        resourceType: 'Condition',
        filters: [
          {
            code: 'code',
            operator: Operator.CONTAINS,
            value,
          },
        ],
      });
      expect(resContains.entry?.map((e) => e.resource?.identifier?.[0].value)).toEqual(expected);
    });

    test.each<[string, Conditions[]]>([
      [disp1, ['codeOneNoCat']],
      [disp1.split(' ').slice(0, 2).join(' '), ['codeOneNoCat']],
      [disp1.split(' ').slice(1, 3).join(' '), ['codeOneNoCat']],
      [disp1.split(' ').slice(-2).join(' '), ['codeOneNoCat']],
    ])('code :text %s', async (value, expected) => {
      const resContains = await repo.search<Condition>({
        resourceType: 'Condition',
        filters: [
          {
            code: 'code',
            operator: Operator.TEXT,
            value,
          },
        ],
      });
      expect(resContains.entry?.map((e) => e.resource?.identifier?.[0].value)).toEqual(expected);
    });

    // test.failing.each<[string, Conditions[]]>([
    // ])('FAILING code :text %s', async (value, expected) => {
    // const resContains = await repo.search<Condition>({
    // resourceType: 'Condition',
    // filters: [
    // {
    // code: 'code',
    // operator: Operator.TEXT,
    // value,
    // },
    // ],
    // });
    // expect(resContains.entry?.map((e) => e.resource?.identifier?.[0].value)).toEqual(expected);
    // });
  });
});

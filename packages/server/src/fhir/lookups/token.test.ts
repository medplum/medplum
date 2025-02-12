import { createReference, getReferenceString, Operator, SNOMED } from '@medplum/core';
import { Bundle, Condition, Patient, ServiceRequest, SpecimenDefinition } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { bundleContains, createTestProject, withTestContext } from '../../test.setup';
import { getSystemRepo, Repository } from '../repo';

describe('Identifier Lookup Table', () => {
  const systemRepo = getSystemRepo();

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
  test.each([
    [Operator.IN, true, false],
    [Operator.NOT_IN, false, true],
  ])('Condition.code :%s search', (operator, cond1, cond2) =>
    withTestContext(async () => {
      // ValueSet: http://hl7.org/fhir/ValueSet/condition-code
      // compose includes codes from http://snomed.info/sct
      // but does not include codes from https://example.com

      const p = await systemRepo.createResource({
        resourceType: 'Patient',
        name: [{ family: randomUUID() }],
      });

      const c1 = await systemRepo.createResource<Condition>({
        resourceType: 'Condition',
        subject: createReference(p),
        code: { coding: [{ system: SNOMED, code: '165002' }] },
      });

      const c2 = await systemRepo.createResource<Condition>({
        resourceType: 'Condition',
        subject: createReference(p),
        code: { coding: [{ system: 'https://example.com', code: 'test' }] },
      });

      const bundle = await systemRepo.search({
        resourceType: 'Condition',
        filters: [
          {
            code: 'subject',
            operator: Operator.EQUALS,
            value: getReferenceString(p),
          },
          {
            code: 'code',
            operator: operator,
            value: 'http://hl7.org/fhir/ValueSet/condition-code',
          },
        ],
      });

      expect(bundle.entry?.length).toStrictEqual(1);
      expect(Boolean(bundleContains(bundle, c1))).toBe(cond1);
      expect(Boolean(bundleContains(bundle, c2))).toBe(cond2);
    })
  );

  describe('Non-strict mode', () => {
    let nonStrictRepo: Repository;
    let repo: Repository;
    let patient: Patient;

    const sys1 = 'http://sys.one';
    const val1 = 'ABCDEFGHIJ';

    beforeAll(async () => {
      const { project } = await createTestProject();
      nonStrictRepo = new Repository({
        strictMode: false,
        projects: [project.id as string],
        author: { reference: 'User/' + randomUUID() },
      });
      repo = new Repository({
        strictMode: true,
        projects: [project.id as string],
        author: { reference: 'User/' + randomUUID() },
      });
      patient = await nonStrictRepo.createResource<Patient>({ resourceType: 'Patient', name: [{ given: ['Henry'] }] });
    });

    test('Handle malformed system', () =>
      withTestContext(async () => {
        const subject = createReference(patient);
        await nonStrictRepo.createResource<Condition>({
          resourceType: 'Condition',
          subject,
          code: {
            coding: [
              {
                system: [sys1] as unknown as string, // Force malformed data
                code: val1,
              },
            ],
          },
        });

        const res = await repo.search<Condition>({
          resourceType: 'Condition',
          filters: [
            {
              code: 'code',
              operator: Operator.EQUALS,
              value: sys1 + '|',
            },
          ],
        });
        //TODO what is actually the expected behavior here?
        expect(toSortedIdentifierValues(res)).toStrictEqual([]);
      }));

    test('Handle malformed value', () =>
      withTestContext(async () => {
        const subject = createReference(patient);
        await nonStrictRepo.createResource<Condition>({
          resourceType: 'Condition',
          subject,
          code: {
            coding: [
              {
                system: 'https://example.com',
                code: ['test1'] as unknown as string, // Force malformed data
              },
            ],
          },
        });

        const res = await repo.search<Condition>({
          resourceType: 'Condition',
          filters: [
            {
              code: 'code',
              operator: Operator.EQUALS,
              value: val1,
            },
          ],
        });
        //TODO what is actually the expected behavior here?
        expect(toSortedIdentifierValues(res)).toStrictEqual([undefined]);
      }));
  });

  describe('Condition.code token queries', () => {
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

    test('Sort by identifier', () =>
      withTestContext(async () => {
        const system = randomUUID();
        await repo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'None' }],
          identifier: [{ system }],
        });

        await repo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'AAA' }],
          identifier: [{ system, value: 'AAA' }],
        });

        await repo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'ZZZ' }],
          identifier: [{ system, value: 'ZZZ' }],
        });

        const ascending = await repo.search<Patient>({
          resourceType: 'Patient',
          filters: [{ code: 'identifier', operator: Operator.EQUALS, value: system + '|' }],
          sortRules: [{ code: 'identifier', descending: false }],
        });
        expect(ascending.entry?.map((e) => e.resource?.name?.[0]?.family)).toStrictEqual(['AAA', 'ZZZ', 'None']);

        const descending = await repo.search<Patient>({
          resourceType: 'Patient',
          filters: [{ code: 'identifier', operator: Operator.EQUALS, value: system + '|' }],
          sortRules: [{ code: 'identifier', descending: true }],
        });
        expect(descending.entry?.map((e) => e.resource?.name?.[0]?.family)).toStrictEqual(['None', 'ZZZ', 'AAA']);
      }));

    test.failing('FAILING Sort by identifier with multiple values', () =>
      withTestContext(async () => {
        const system = randomUUID();
        await repo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'First' }],
          identifier: [
            { system, value: 'AAA' },
            { system, value: 'ZZZ' },
          ],
        });

        await repo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Alice'], family: 'Second' }],
          identifier: [{ system, value: 'LLL' }],
        });

        const ascending = await repo.search<Patient>({
          resourceType: 'Patient',
          filters: [{ code: 'identifier', operator: Operator.EQUALS, value: system + '|' }],
          sortRules: [{ code: 'identifier', descending: false }],
        });

        const descending = await repo.search<Patient>({
          resourceType: 'Patient',
          filters: [{ code: 'identifier', operator: Operator.EQUALS, value: system + '|' }],
          sortRules: [{ code: 'identifier', descending: true }],
        });

        // Counterintuitive results, but yes: the same sort order is expected for both ascending/descending
        // since ascending should use "AAA" and descending should use "ZZZ"
        expect(ascending.entry?.map((e) => e.resource?.name?.[0]?.family)).toStrictEqual(['First', 'Second']);
        expect(descending.entry?.map((e) => e.resource?.name?.[0]?.family)).toStrictEqual(['First', 'Second']);
      })
    );

    test.each<[string, Conditions[]]>([
      [sys1, ['codeOneNoCat', 'codeOneCatOne', 'codeOneCatTwo']],
      [sys2, []],
      [val1, []], // incorrectly passing val as a system
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
      expect(toSortedIdentifierValues(res)).toStrictEqual(toSorted(expected));
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
      expect(toSortedIdentifierValues(resEquals)).toStrictEqual(toSorted(expected));

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
      expect(toSortedIdentifierValues(resContains)).toStrictEqual(toSorted(expected));
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
      expect(toSortedIdentifierValues(res)).toStrictEqual(toSorted(expected));
    });

    test.each<[string, Conditions[]]>([
      [val1, ['codeOneWithoutSystemNoCat']],
      [val2, ['codeTwoWithoutSystemCatTwo']],
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
      expect(toSortedIdentifierValues(res)).toStrictEqual(expected);
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
      expect(toSortedIdentifierValues(res)).toStrictEqual(expected);
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
      expect(toSortedIdentifierValues(resContains)).toStrictEqual(toSorted(expected));
    });

    //TODO{mattlong} these tests should pass in new token implementation
    test.failing.each<[string, Conditions[]]>([
      [val1.slice(1, 3), ['codeOneNoCat', 'codeOneCatOne', 'codeOneCatTwo', 'codeOneWithoutSystemNoCat']],
      [val2.slice(1, 3), ['codeTwoWithoutSystemCatTwo']],
    ])('FAILING code :contains middle of value %s', async (value, expected) => {
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
      expect(toSortedIdentifierValues(resContains)).toStrictEqual(toSorted(expected));
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
      expect(toSortedIdentifierValues(resContains)).toStrictEqual(expected);
    });
  });
});

function toIdentifierValues(bundle: Bundle<Condition | Patient>): string[] {
  return bundle.entry?.map((e) => e.resource?.identifier?.[0].value as string) ?? [];
}

function toSortedIdentifierValues(bundle: Bundle<Condition | Patient>): string[] {
  return toSorted(toIdentifierValues(bundle));
}

// Array.prototype.toSorted isn't available in Node 18, so write our own
function toSorted<T extends string>(array: T[]): T[] {
  const newArray = Array.from(array);
  newArray.sort((a, b) => a.localeCompare(b));
  return newArray;
}

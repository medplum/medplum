import { createReference, getReferenceString, getSearchParameter, Operator, SNOMED, WithId } from '@medplum/core';
import {
  Bundle,
  Condition,
  Identifier,
  MedicationRequest,
  Patient,
  Reference,
  SearchParameter,
  ServiceRequest,
  SpecimenDefinition,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { bundleContains, createTestProject, withTestContext } from '../test.setup';
import { getSystemRepo, Repository } from './repo';
import { getSearchParameterImplementation, TokenColumnSearchParameterImplementation } from './searchparameter';
import { loadStructureDefinitions } from './structure';
import { TokenQueryOperators } from './token-column';
import { buildTokensForSearchParameter, Token } from './tokens';

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
    const text = 'this is some text';

    const patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      identifier: [{ system: 'https://www.example.com', value: identifier, type: { text } }],
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

    const goodTextResult = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: identifier,
        },
        {
          code: 'identifier',
          operator: Operator.TEXT,
          value: text,
        },
      ],
    });
    expect(goodTextResult.entry?.length).toStrictEqual(1);
    expect(goodTextResult.entry?.[0]?.resource?.id).toStrictEqual(patient.id);

    const badTextResult = await systemRepo.search({
      resourceType: 'Patient',
      filters: [
        {
          code: 'identifier',
          operator: Operator.TEXT,
          // :text on the identifier value itself should not match
          value: identifier,
        },
      ],
    });
    expect(badTextResult.entry?.length).toStrictEqual(0);
  }));

test.each(TokenQueryOperators)('%s with empty value does not throw errors', async (operator) => {
  const search = systemRepo.search({
    resourceType: 'Patient',
    filters: [
      {
        code: 'identifier',
        operator: operator,
        value: '',
      },
    ],
  });

  await expect(search).resolves;
});

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

describe(':contains', () => {
  const baseIdentifierValue = randomUUID();
  const identifier = randomUUID();
  let patient1: Patient;
  const baseFilters = [
    {
      code: 'identifier',
      operator: Operator.EQUALS,
      value: baseIdentifierValue,
    },
  ];

  beforeAll(async () => {
    const baseIdentifier = { system: 'https://hi.com', value: baseIdentifierValue };

    patient1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      telecom: [
        { system: 'email', value: 'prefix-email-postfix' },
        { system: 'phone', value: 'prefix-phone-postfix' },
        { system: 'pager', value: 'prefix-pager-postfix' },
      ],
      identifier: [baseIdentifier, { system: 'https://www.example.com', value: identifier }],
    });
  });

  test('prefix on Patient-identifier', () =>
    withTestContext(async () => {
      const identifierResult = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          ...baseFilters,
          {
            code: 'identifier',
            operator: Operator.CONTAINS,
            value: identifier.slice(0, 5),
          },
        ],
      });

      expect(identifierResult.entry?.length).toStrictEqual(0);
    }));

  test('infix on Patient-identifier', () =>
    withTestContext(async () => {
      const identifierResult = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          ...baseFilters,
          {
            code: 'identifier',
            operator: Operator.CONTAINS,
            value: identifier.slice(5, 10),
          },
        ],
      });

      expect(identifierResult.entry?.length).toStrictEqual(0);
    }));

  test.each(['pager', 'PAGER', 'PaGeR'])('infix on Patient-telecom', (value) =>
    withTestContext(async () => {
      const result = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          ...baseFilters,
          {
            code: 'telecom',
            operator: Operator.CONTAINS,
            value,
          },
        ],
      });

      expect(result.entry?.length).toStrictEqual(1);
      expect(bundleContains(result, patient1)).toBeDefined();
    })
  );

  test('infix on Patient-email', () =>
    withTestContext(async () => {
      const result = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          ...baseFilters,
          {
            code: 'email',
            operator: Operator.CONTAINS,
            value: 'email',
          },
        ],
      });

      expect(result.entry?.length).toStrictEqual(1);
      expect(bundleContains(result, patient1)).toBeDefined();
    }));

  test('infix on Patient-phone', () =>
    withTestContext(async () => {
      const result = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          ...baseFilters,
          {
            code: 'phone',
            operator: Operator.CONTAINS,
            value: 'phone',
          },
        ],
      });

      expect(result.entry?.length).toStrictEqual(1);
      expect(bundleContains(result, patient1)).toBeDefined();
    }));
});

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

    const patient3 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: name }],
      // no identifiers should match NOT_EQUALS
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
    expect(searchResult1.entry?.length).toStrictEqual(2);
    expect(bundleContains(searchResult1, patient1)).toBeUndefined();
    expect(bundleContains(searchResult1, patient2)).toBeDefined();
    expect(bundleContains(searchResult1, patient3)).toBeDefined();
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

describe('Missing/present', () => {
  const family = randomUUID();
  const email = randomUUID();
  const identifier = randomUUID();
  let p1: Patient;
  let p2: Patient;

  beforeAll(async () => {
    p1 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      meta: {
        security: [{ code: '123' }],
      },
      name: [{ family }],
      telecom: [{ system: 'email', value: email + 'abc' }],
    });

    p2 = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ family }],
      telecom: [{ system: 'email', value: email + 'xyz' }],
      identifier: [{ system: 'https://www.example.com', value: identifier }],
    });
  });

  test.each([
    ['identifier', Operator.MISSING, 'true', true, false, true],
    ['identifier', Operator.MISSING, 'false', false, true, true],
    ['identifier', Operator.PRESENT, 'true', false, true, true],
    ['identifier', Operator.PRESENT, 'false', true, false, true],
    ['telecom', Operator.MISSING, 'true', false, false, true],
    ['telecom', Operator.MISSING, 'false', true, true, true],
    ['telecom', Operator.PRESENT, 'true', true, true, true],
    ['telecom', Operator.PRESENT, 'false', false, false, true],
    ['_security', Operator.MISSING, 'true', false, true, false],
    ['_security', Operator.MISSING, 'false', true, false, false],
    ['_security', Operator.PRESENT, 'true', true, false, false],
    ['_security', Operator.PRESENT, 'false', false, true, false],
  ])('%s :%s %s', (code, operator, value, expected1, expected2, expectedHasDedicated) =>
    withTestContext(async () => {
      const searchParam = getSearchParameter('Patient', code) as SearchParameter;
      const impl = getSearchParameterImplementation('Patient', searchParam);
      expect(impl.searchStrategy).toStrictEqual('token-column');
      expect((impl as TokenColumnSearchParameterImplementation).hasDedicatedColumns).toStrictEqual(
        expectedHasDedicated
      );

      const res = await systemRepo.search({
        resourceType: 'Patient',
        filters: [
          { code: 'name', operator: Operator.EQUALS, value: family },
          { code, operator, value },
        ],
      });
      expect(Boolean(bundleContains(res, p1))).toBe(expected1);
      expect(Boolean(bundleContains(res, p2))).toBe(expected2);
    })
  );
});

test.each([[Operator.IN], [Operator.NOT_IN]])('Condition.code :%s search', (operator) =>
  withTestContext(async () => {
    // ValueSet: http://hl7.org/fhir/ValueSet/condition-code
    // compose includes codes from http://snomed.info/sct
    // but does not include codes from https://example.com

    const p = await systemRepo.createResource({
      resourceType: 'Patient',
      name: [{ family: randomUUID() }],
    });

    await systemRepo.createResource<Condition>({
      resourceType: 'Condition',
      subject: createReference(p),
      code: { coding: [{ system: SNOMED, code: '165002' }] },
    });

    await systemRepo.createResource<Condition>({
      resourceType: 'Condition',
      subject: createReference(p),
      code: { coding: [{ system: 'https://example.com', code: 'test' }] },
    });

    await expect(
      systemRepo.search({
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
      })
    ).rejects.toThrow(/not supported/);
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
      projects: [project],
      author: { reference: 'User/' + randomUUID() },
    });
    repo = new Repository({
      strictMode: true,
      projects: [project],
      author: { reference: 'User/' + randomUUID() },
    });
    patient = await nonStrictRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Henry'] }],
    });
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

  let patient: WithId<Patient>;
  let subject: Reference<Patient> & { reference: string };

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
      projects: [project],
      author: { reference: 'User/' + randomUUID() },
    });

    patient = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ given: ['Henry'] }] });
    subject = createReference(patient);

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

  test('Sort by identifier with multiple values', () =>
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

      // Ideally ASC and DESC would have the same sort order since
      // ascending should use "AAA" and descending should use "ZZZ",
      // but a simpler sort implementation is used
      expect(ascending.entry?.map((e) => e.resource?.name?.[0]?.family)).toStrictEqual(['First', 'Second']);
      expect(descending.entry?.map((e) => e.resource?.name?.[0]?.family)).toStrictEqual(['Second', 'First']);
    }));

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
    expect(toSortedIdentifierValues(resContains)).toStrictEqual([]);
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

  test.each<string>([val1, val1.slice(0, 3)])('code :contains beginning of value %s', async (value) => {
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
    expect(toSortedIdentifierValues(resContains)).toStrictEqual([]);
  });

  test.each<[string]>([[val1.slice(1, 3)], [val2.slice(1, 3)]])(`code :contains middle of value %s`, async (value) => {
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
    // Token columns don't support :contains on `code`
    // Token lookup tables don't support infix queries
    expect(toSortedIdentifierValues(resContains).length).toBe(0);
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

  describe('code :text search for special chars', () => {
    const identifier = randomUUID();
    let condWithSpecialChars: WithId<Condition>;
    beforeAll(async () => {
      condWithSpecialChars = await repo.createResource<Condition>({
        resourceType: 'Condition',
        code: {
          coding: [
            {
              system: sys1,
              code: 'some-value',
              display: '.^$*+?()[]{}\\|hello|',
            },
          ],
        },
        subject,
        identifier: [
          {
            system: sys1,
            value: identifier,
          },
        ],
      });
    });

    // same behavior between token columns and lookup tables
    test.each<[string, boolean]>([
      ['.', true],
      ['^', true],
      ['$', true],
      ['*', true],
      ['+', true],
      ['?', true],
      ['(', true],
      [')', true],
      ['[', true],
      [']', true],
      ['{', true],
      ['}', true],
      ['\\', true],
      ['()', true],
      ['[]', true],
      ['{}', true],

      ['.^', true],
      ['.^$*+', true],
      ['$', true],
      ['+?', true],
      [']{', true],
      ['hello', true],

      ['||', false],
    ])(':text search for %s should match? %s', async (query, shouldBeFound) => {
      const res = await repo.search<Condition>({
        resourceType: 'Condition',
        filters: [
          {
            code: 'subject',
            operator: Operator.EQUALS,
            value: subject.reference,
          },
          {
            code: 'identifier',
            operator: Operator.EQUALS,
            value: identifier,
          },
          {
            code: 'code',
            operator: Operator.TEXT,
            value: query,
          },
        ],
      });
      if (shouldBeFound) {
        expect(res.entry?.length).toBe(1);
        expect(res.entry?.[0].resource?.id).toBe(condWithSpecialChars.id);
      } else {
        expect(res.entry?.length).toBe(0);
      }
    });

    // differing behavior between token columns and lookup tables
    test.each<[string, boolean]>([
      ['|', true],
      ['|hello|', true],
      ['.()', false],
    ])(':text search for %s should match? %s', async (query, shouldBeFound) => {
      const res = await repo.search<Condition>({
        resourceType: 'Condition',
        filters: [
          {
            code: 'subject',
            operator: Operator.EQUALS,
            value: subject.reference,
          },
          {
            code: 'identifier',
            operator: Operator.EQUALS,
            value: identifier,
          },
          {
            code: 'code',
            operator: Operator.TEXT,
            value: query,
          },
        ],
      });
      if (shouldBeFound) {
        expect(res.entry?.length).toBe(1);
        expect(res.entry?.[0].resource?.id).toBe(condWithSpecialChars.id);
      } else {
        expect(res.entry?.length).toBe(0);
      }
    });
  });
});
describe('MedicationRequest.code legacy behavior', () => {
  let repo: Repository;
  let patient: WithId<Patient>;
  let mr1: WithId<MedicationRequest>;
  let mr2: WithId<MedicationRequest>;
  const sys1 = 'http://sys.one';

  const val1 = 'ABCDEFGHIJ';
  const val2 = 'ZZZZZZZZZZ';

  beforeAll(async () => {
    const { project } = await createTestProject();
    repo = new Repository({
      strictMode: true,
      projects: [project],
      author: { reference: 'User/' + randomUUID() },
    });

    patient = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ given: ['Henry'] }] });
    mr1 = await repo.createResource<MedicationRequest>({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: createReference(patient),
      medicationCodeableConcept: { coding: [{ system: sys1, code: val1 }] },
    });
    mr2 = await repo.createResource<MedicationRequest>({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: createReference(patient),
      medicationCodeableConcept: { coding: [{ system: sys1, code: val2 }] },
    });
  });

  test('Formerly "legacy" column implementation search params use `token-column` strategy', async () => {
    const searchParam = getSearchParameter('MedicationRequest', 'code');
    if (!searchParam) {
      throw new Error('Could not find MedicationRequest-code search parameter');
    }
    const impl = getSearchParameterImplementation('MedicationRequest', searchParam);
    expect(impl.searchStrategy).toBe('token-column');
  });

  test('Search by system only works when using token columns', async () => {
    const searchResult = await repo.search<MedicationRequest>({
      resourceType: 'MedicationRequest',
      filters: [
        {
          code: 'code',
          operator: Operator.EQUALS,
          value: sys1 + '|',
        },
      ],
    });
    expect(searchResult.entry?.length).toStrictEqual(2);
    expect(searchResult.entry?.map((e) => e.resource?.id)).toContain(mr1.id);
    expect(searchResult.entry?.map((e) => e.resource?.id)).toContain(mr2.id);
  });

  test('Search by value always works', async () => {
    const searchResult = await repo.search({
      resourceType: 'MedicationRequest',
      filters: [
        {
          code: 'code',
          operator: Operator.EQUALS,
          value: val1,
        },
      ],
    });
    expect(searchResult.entry?.length).toStrictEqual(1);
    expect(searchResult.entry?.[0]?.resource?.id).toStrictEqual(mr1.id);
  });

  test('Search by system and value only works when using token columns', async () => {
    const searchResult = await repo.search({
      resourceType: 'MedicationRequest',
      filters: [
        {
          code: 'code',
          operator: Operator.EQUALS,
          value: sys1 + '|' + val1,
        },
      ],
    });
    expect(searchResult.entry?.length).toStrictEqual(1);
    expect(searchResult.entry?.[0]?.resource?.id).toStrictEqual(mr1.id);
  });

  test('Sort by code always works', async () => {
    const ascResult = await repo.search<MedicationRequest>({
      resourceType: 'MedicationRequest',
      filters: [
        {
          code: 'patient',
          operator: Operator.EQUALS,
          value: patient.id,
        },
      ],
      sortRules: [{ code: 'code', descending: false }],
    });
    expect(ascResult.entry?.length).toStrictEqual(2);
    expect(ascResult.entry?.map((e) => e.resource?.id)).toContain(mr1.id);
    expect(ascResult.entry?.map((e) => e.resource?.id)).toContain(mr2.id);
    expect(ascResult.entry?.map((e) => e.resource?.medicationCodeableConcept?.coding?.[0]?.code)).toStrictEqual([
      'ABCDEFGHIJ',
      'ZZZZZZZZZZ',
    ]);

    const descResult = await repo.search<MedicationRequest>({
      resourceType: 'MedicationRequest',
      filters: [
        {
          code: 'patient',
          operator: Operator.EQUALS,
          value: patient.id,
        },
      ],
      sortRules: [{ code: 'code', descending: true }],
    });
    expect(descResult.entry?.length).toStrictEqual(2);
    expect(descResult.entry?.map((e) => e.resource?.id)).toContain(mr1.id);
    expect(descResult.entry?.map((e) => e.resource?.id)).toContain(mr2.id);
    expect(descResult.entry?.map((e) => e.resource?.medicationCodeableConcept?.coding?.[0]?.code)).toStrictEqual([
      'ZZZZZZZZZZ',
      'ABCDEFGHIJ',
    ]);
  });
});

describe('buildTokens', () => {
  beforeAll(() => {
    loadStructureDefinitions();
  });

  test('empty resource', () => {
    const identifierSearchParam = getSearchParameter('Patient', 'identifier');
    if (!identifierSearchParam) {
      throw new Error('Could not find identifier search parameter');
    }
    const r1: WithId<Patient> = {
      resourceType: 'Patient',
      id: '1',
      identifier: undefined,
    };
    const result1: Token[] = [];
    buildTokensForSearchParameter(result1, r1, identifierSearchParam);
    expect(result1).toStrictEqual([]);

    const validIdentifiers: Identifier[] = [
      {},
      { system: 'http://example.com', value: '123' },
      { system: 'http://example.com', value: '123' },
      { system: 'http://example.com', value: '456' },
      { use: 'official' },
    ];
    const r2: WithId<Patient> = {
      resourceType: 'Patient',
      id: '2',
      identifier: [null, undefined, ...validIdentifiers] as unknown as Identifier[],
    };
    const result2: Token[] = [];
    buildTokensForSearchParameter(result2, r2, identifierSearchParam);
    expect(result2).toStrictEqual([
      { code: 'identifier', system: 'http://example.com', value: '123' },
      { code: 'identifier', system: 'http://example.com', value: '456' },
    ]);
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

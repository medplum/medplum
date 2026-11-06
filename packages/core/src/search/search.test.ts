// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, Patient, SearchParameter } from '@medplum/fhirtypes';
import { OperationOutcomeError, getStatus } from '../outcomes';
import { indexSearchParameterBundle } from '../types';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import type { SearchRequest } from './search';
import {
  Operator,
  escapeSearchValue,
  formatSearchQuery,
  isChainedSearchFilter,
  parseSearchRequest,
  parseXFhirQuery,
  splitSearchOnComma,
} from './search';

describe('Search Utils', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test.each<[string, Partial<SearchRequest> | Error]>([
    ['Patient', { resourceType: 'Patient' }],
    [
      'Patient?name=alice',
      {
        resourceType: 'Patient',
        filters: [{ code: 'name', operator: Operator.EQUALS, value: 'alice' }],
      },
    ],
    [
      'Patient?_fields=id,name,birthDate',
      {
        resourceType: 'Patient',
        fields: ['id', 'name', 'birthDate'],
      },
    ],
    [
      // Should ignore _ query parameter in query string
      `Patient?name=Alice&_=${new Date().getTime()}`,
      {
        resourceType: 'Patient',
        filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Alice' }],
      },
    ],
    [
      'Observation?date=gt2024-10',
      {
        resourceType: 'Observation',
        filters: [{ code: 'date', operator: Operator.GREATER_THAN, value: '2024-10' }],
      },
    ],

    [
      'Observation?date=ge2024-10-01T14:30%2B05:30',
      {
        resourceType: 'Observation',
        filters: [{ code: 'date', operator: Operator.GREATER_THAN_OR_EQUALS, value: '2024-10-01T14:30+05:30' }],
      },
    ],
    [
      'Observation?date=2024-02-29',
      {
        resourceType: 'Observation',
        filters: [{ code: 'date', operator: Operator.EQUALS, value: '2024-02-29' }],
      },
    ],
    [
      'Observation?date=le2024-10-01T14:30',
      {
        resourceType: 'Observation',
        filters: [{ code: 'date', operator: Operator.LESS_THAN_OR_EQUALS, value: '2024-10-01T14:30' }],
      },
    ],

    [null as unknown as string, new Error('Invalid search URL')],
    [undefined as unknown as string, new Error('Invalid search URL')],
    ['', new Error('Invalid search URL')],
    ['Observation?date=12/17', new Error('Invalid format for date search parameter: 12/17')],
    ['Observation?date=012522', new Error('Invalid format for date search parameter: 012522')],
    ['Observation?date=2028-05-15T14', new Error('Invalid format for date search parameter: 2028-05-15T14')],
    ['Observation?date=2024-10-01T14:30-', new Error('Invalid format for date search parameter: 2024-10-01T14:30-')],
    ['Observation?date=2025-01-10%2B05:00', new Error('Invalid format for date search parameter: 2025-01-10+05:00')],
    [
      'Observation?date=2026-02-28T12:34:60Z',
      new Error('Invalid format for date search parameter: 2026-02-28T12:34:60Z'),
    ],
    ['Observation?date=2024-02-31', new Error('Invalid format for date search parameter: 2024-02-31')],
  ])('parseSearchRequest($0) => $1', (url, expected) => {
    if (expected instanceof Error) {
      expect(() => parseSearchRequest(url)).toThrow(expected.message);
    } else {
      expect(parseSearchRequest(url)).toMatchObject(expected);
      expect(parseSearchRequest(new URL('http://example.com/' + url))).toMatchObject(expected);
    }
  });

  test.each([
    ['Observation?value-quantity=undefined', 'Invalid format for quantity search parameter: undefined'],
    ['RiskAssessment?probability=undefined', 'Invalid format for number search parameter: undefined'],
  ])('%s returns 400 invalid', (url, message) => {
    let thrown: unknown;
    try {
      parseSearchRequest(url);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OperationOutcomeError);
    const outcome = (thrown as OperationOutcomeError).outcome;
    expect(getStatus(outcome)).toBe(400);
    expect(outcome.issue).toEqual([
      {
        severity: 'error',
        code: 'invalid',
        details: { text: message },
      },
    ]);
  });

  test('parseSearchRequest with query dictionary', () => {
    expect(parseSearchRequest('Patient', { name: 'alice' })).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.EQUALS, value: 'alice' }],
    });
    expect(parseSearchRequest('Patient', { name: ['alice'] })).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.EQUALS, value: 'alice' }],
    });
    expect(parseSearchRequest('Patient', { _fields: 'id,name,birthDate' })).toMatchObject({
      resourceType: 'Patient',
      fields: ['id', 'name', 'birthDate'],
    });
  });

  test('parseSearchRequest with URL', () => {
    expect(() => parseSearchRequest(null as unknown as URL)).toThrow('Invalid search URL');
    expect(() => parseSearchRequest(undefined as unknown as URL)).toThrow('Invalid search URL');

    expect(parseSearchRequest(new URL('https://example.com/Patient'))).toMatchObject({ resourceType: 'Patient' });
    expect(parseSearchRequest(new URL('https://example.com/Patient?name=alice'))).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.EQUALS, value: 'alice' }],
    });
    expect(parseSearchRequest(new URL('https://example.com/Patient?_fields=id,name,birthDate'))).toMatchObject({
      resourceType: 'Patient',
      fields: ['id', 'name', 'birthDate'],
    });
  });

  test('Parse Patient search', () => {
    const result = parseSearchRequest('/x/y/z/Patient');
    expect(result.resourceType).toBe('Patient');
    expect(result.filters).toBeUndefined();
  });

  test('Parse Patient search with trailing slash', () => {
    const result = parseSearchRequest('/Patient/');
    expect(result.resourceType).toBe('Patient');
    expect(result.filters).toBeUndefined();
  });

  test('Parse Patient search name', () => {
    const result = parseSearchRequest('Patient?name=alice');
    expect(result.resourceType).toBe('Patient');
    expect(result.filters).toStrictEqual([
      {
        code: 'name',
        operator: Operator.EQUALS,
        value: 'alice',
      },
    ]);
  });

  test('Parse Patient search fields', () => {
    const result = parseSearchRequest('Patient?_fields=id,name,birthDate');
    expect(result.resourceType).toBe('Patient');
    expect(result.fields).toStrictEqual(['id', 'name', 'birthDate']);
  });

  test('Parse Patient search sort', () => {
    const result = parseSearchRequest('Patient?_sort=birthDate');
    expect(result.resourceType).toBe('Patient');
    expect(result.sortRules).toStrictEqual([{ code: 'birthDate', descending: false }]);
  });

  test('Parse Patient search sort descending', () => {
    const result = parseSearchRequest('Patient?_sort=-birthDate');
    expect(result.resourceType).toBe('Patient');
    expect(result.sortRules).toStrictEqual([{ code: 'birthDate', descending: true }]);
  });

  test('Parse Patient search total', () => {
    const result = parseSearchRequest('Patient?_total=accurate');
    expect(result.resourceType).toBe('Patient');
    expect(result.total).toBe('accurate');
  });

  test('Parse Patient count and offset', () => {
    const result = parseSearchRequest('Patient?_count=10&_offset=20');
    expect(result.resourceType).toBe('Patient');
    expect(result.offset).toBe(20);
    expect(result.count).toBe(10);
  });

  test('Parse Patient cursor', () => {
    const result = parseSearchRequest('Patient?_count=10&_cursor=foo');
    expect(result.resourceType).toBe('Patient');
    expect(result.count).toBe(10);
    expect(result.cursor).toBe('foo');
    expect(result.offset).toBeUndefined();
  });

  test('Parse modifier operator', () => {
    const result = parseSearchRequest('Patient?name:contains=alice');
    expect(result).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.CONTAINS,
          value: 'alice',
        },
      ],
    });
  });

  test('Parse prefix operator', () => {
    const result = parseSearchRequest('Patient?birthdate=gt2000-01-01');
    expect(result).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: 'birthdate',
          operator: Operator.GREATER_THAN,
          value: '2000-01-01',
        },
      ],
    });
  });

  test('Parse prefix operator does not work on string', () => {
    const result = parseSearchRequest('Patient?name=leslie');
    expect(result).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'leslie',
        },
      ],
    });
  });

  test('Parse multiple filters same code', () => {
    const result = parseSearchRequest(
      'Patient?_lastUpdated=ge2023-04-01T07%3A00%3A00.000Z&_lastUpdated=le2023-05-01T06%3A59%3A59.999Z'
    );
    expect(result).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: '_lastUpdated',
          operator: Operator.GREATER_THAN_OR_EQUALS,
          value: '2023-04-01T07:00:00.000Z',
        },
        {
          code: '_lastUpdated',
          operator: Operator.LESS_THAN_OR_EQUALS,
          value: '2023-05-01T06:59:59.999Z',
        },
      ],
    });
  });

  test.each([
    [
      'Patient?_lastUpdated:in=2025-10-15',
      { resourceType: 'Patient', filters: [{ code: '_lastUpdated', operator: Operator.IN, value: '2025-10-15' }] },
    ],
    [
      'Patient?_lastUpdated:not-in=2025-10-15',
      { resourceType: 'Patient', filters: [{ code: '_lastUpdated', operator: Operator.NOT_IN, value: '2025-10-15' }] },
    ],
    [
      'Patient?_lastUpdated:above=2025-10-15',
      { resourceType: 'Patient', filters: [{ code: '_lastUpdated', operator: Operator.ABOVE, value: '2025-10-15' }] },
    ],
    [
      'Patient?_lastUpdated:foobar=2025-10-15',
      { resourceType: 'Patient', filters: [{ code: '_lastUpdated', operator: 'foobar', value: '2025-10-15' }] },
    ],
  ])('Invalid modifiers still parsed in $0', (url, expected) => {
    if (expected instanceof Error) {
      expect(() => parseSearchRequest(url)).toThrow(expected);
    } else {
      expect(parseSearchRequest(url)).toMatchObject(expected);
    }
  });

  test.each([
    [
      'single-link chained search parameter',
      'Patient?organization.name=Kaiser%20Permanente&_has:Observation:subject:performer:Practitioner.name=Alice',
      {
        resourceType: 'Patient',
        filters: [
          {
            code: 'organization.name',
            operator: Operator.EQUALS,
            value: 'Kaiser Permanente',
          },
          {
            code: '_has:Observation:subject:performer:Practitioner.name',
            operator: Operator.EQUALS,
            value: 'Alice',
          },
        ],
      },
    ],
    [
      'multi-link chained search parameter',
      'Patient?_has:Observation:subject:encounter:Encounter._has:DiagnosticReport:encounter:result.specimen.parent.collected=2023',
      {
        resourceType: 'Patient',
        filters: [
          {
            code: '_has:Observation:subject:encounter:Encounter._has:DiagnosticReport:encounter:result.specimen.parent.collected',
            operator: Operator.EQUALS,
            value: '2023',
          },
        ],
      },
    ],
    [
      'prefixes are not processed for chained search parameters',
      'Patient?_has:EpisodeOfCare:patient:date=ge2026-04-01',
      {
        resourceType: 'Patient',
        filters: [
          {
            code: '_has:EpisodeOfCare:patient:date',
            operator: Operator.EQUALS,
            value: 'ge2026-04-01',
          },
        ],
      },
    ],
  ])('chained search parseSearchRequest %s', (_, url, expected) => {
    const searchReq = parseSearchRequest(url);
    expect(searchReq).toMatchObject(expected);
  });

  test('Format Patient search', () => {
    const result = formatSearchQuery({
      resourceType: 'Patient',
      fields: ['id', 'name'],
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'alice',
        },
      ],
      offset: 10,
      count: 5,
      total: 'accurate',
    });
    expect(result).toStrictEqual('?_count=5&_fields=id,name&_offset=10&_total=accurate&name=alice');
  });

  test('Format empty search', () => {
    const result = formatSearchQuery({ resourceType: 'Patient' });
    expect(result).toStrictEqual('');
  });

  test('Format Patient search sort', () => {
    const result = formatSearchQuery({
      resourceType: 'Patient',
      fields: ['id', 'name'],
      filters: [],
      sortRules: [
        {
          code: 'name',
        },
      ],
    });
    expect(result).toStrictEqual('?_fields=id,name&_sort=name');
  });

  test('Format Patient search sort descending', () => {
    const result = formatSearchQuery({
      resourceType: 'Patient',
      fields: ['id', 'name'],
      filters: [],
      sortRules: [
        {
          code: 'name',
          descending: true,
        },
      ],
    });
    expect(result).toStrictEqual('?_fields=id,name&_sort=-name');
  });

  test('Format Patient search total', () => {
    const result = formatSearchQuery({
      resourceType: 'Patient',
      total: 'accurate',
    });
    expect(result).toStrictEqual('?_total=accurate');
  });

  test('Format number not equals', () => {
    expect(
      formatSearchQuery({
        resourceType: 'RiskAssessment',
        filters: [{ code: 'probability', operator: Operator.NOT_EQUALS, value: '0.5' }],
      })
    ).toStrictEqual('?probability=ne0.5');
  });

  test('Format number less than', () => {
    expect(
      formatSearchQuery({
        resourceType: 'RiskAssessment',
        filters: [{ code: 'probability', operator: Operator.LESS_THAN, value: '0.5' }],
      })
    ).toStrictEqual('?probability=lt0.5');
  });

  test('Format number less than or equal', () => {
    expect(
      formatSearchQuery({
        resourceType: 'RiskAssessment',
        filters: [{ code: 'probability', operator: Operator.LESS_THAN_OR_EQUALS, value: '0.5' }],
      })
    ).toStrictEqual('?probability=le0.5');
  });

  test('Format number greater than', () => {
    expect(
      formatSearchQuery({
        resourceType: 'RiskAssessment',
        filters: [{ code: 'probability', operator: Operator.GREATER_THAN, value: '0.5' }],
      })
    ).toStrictEqual('?probability=gt0.5');
  });

  test('Format number greater than or equal', () => {
    expect(
      formatSearchQuery({
        resourceType: 'RiskAssessment',
        filters: [{ code: 'probability', operator: Operator.GREATER_THAN_OR_EQUALS, value: '0.5' }],
      })
    ).toStrictEqual('?probability=ge0.5');
  });

  test('Format URL below', () => {
    expect(
      formatSearchQuery({
        resourceType: 'ValueSet',
        filters: [{ code: 'url', operator: Operator.BELOW, value: 'http://acme.org' }],
      })
    ).toStrictEqual('?url:below=http%3A%2F%2Facme.org');
  });

  test('Format URL above', () => {
    expect(
      formatSearchQuery({
        resourceType: 'ValueSet',
        filters: [{ code: 'url', operator: Operator.ABOVE, value: 'http://acme.org' }],
      })
    ).toStrictEqual('?url:above=http%3A%2F%2Facme.org');
  });

  test('Format token not', () => {
    expect(
      formatSearchQuery({
        resourceType: 'Condition',
        filters: [{ code: 'code', operator: Operator.NOT, value: 'x' }],
      })
    ).toStrictEqual('?code:not=x');
  });

  test('Format token not', () => {
    expect(
      formatSearchQuery({
        resourceType: 'Condition',
        filters: [{ code: 'code', operator: Operator.NOT, value: 'x' }],
      })
    ).toStrictEqual('?code:not=x');
  });

  test('Format types', () => {
    expect(formatSearchQuery({ resourceType: 'Patient', types: ['Patient', 'Practitioner', 'Organization'] })).toEqual(
      '?_type=Patient,Practitioner,Organization'
    );
  });

  const maritalStatus = 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus';
  test('Format _include', () => {
    expect(
      formatSearchQuery({
        resourceType: 'Patient',
        include: [
          {
            resourceType: 'Patient',
            searchParam: 'organization',
          },
        ],
      })
    ).toStrictEqual('?_include=Patient:organization');
  });

  test('Format _include:iterate', () => {
    expect(
      formatSearchQuery({
        resourceType: 'Patient',
        include: [
          {
            resourceType: 'Patient',
            searchParam: 'organization',
            modifier: 'iterate',
          },
        ],
      })
    ).toStrictEqual('?_include:iterate=Patient:organization');
  });

  test.each<[string, SearchRequest]>([
    [
      'Patient?name:contains=Just',
      { resourceType: 'Patient', filters: [{ code: 'name', operator: Operator.CONTAINS, value: 'Just' }] },
    ],
    [
      'Observation?subject={{ %patient }}',
      {
        resourceType: 'Observation',
        filters: [{ code: 'subject', operator: Operator.EQUALS, value: 'Patient/12345' }],
      },
    ],
    [
      'Observation?patient={{ %patient.id }}',
      { resourceType: 'Observation', filters: [{ code: 'patient', operator: Operator.EQUALS, value: '12345' }] },
    ],
    [
      'Observation?date=gt{{ %patient.birthDate }}&performer={{ %patient.generalPractitioner[0].reference }}',
      {
        resourceType: 'Observation',
        filters: [
          { code: 'date', operator: Operator.GREATER_THAN, value: '1955-10-02' },
          { code: 'performer', operator: Operator.EQUALS, value: 'Practitioner/98765' },
        ],
      },
    ],
  ])('parseXFhirQuery(%s)', (query, expected) => {
    const patient: Patient = {
      resourceType: 'Patient',
      id: '12345',
      gender: 'unknown',
      birthDate: '1955-10-02',
      multipleBirthBoolean: true,
      maritalStatus: {
        coding: [
          { system: maritalStatus, code: 'unmarried' },
          { system: maritalStatus, code: 'A' },
        ],
      },
      contact: [{ telecom: [{ system: 'url', value: 'http://example.com' }] }],
      address: [{ country: 'US', state: 'DE' }],
      name: [{ given: ['Jan', 'Wyatt'], family: 'Smith' }, { text: 'Green Lantern' }],
      generalPractitioner: [{ reference: 'Practitioner/98765' }],
    };
    const actual = parseXFhirQuery(query, { '%patient': { type: 'Patient', value: patient } });
    expect(actual).toStrictEqual(expected);
  });

  test('Split search value on comma', () => {
    expect(splitSearchOnComma('')).toStrictEqual(['']);
    expect(splitSearchOnComma('x')).toStrictEqual(['x']);
    expect(splitSearchOnComma('x,y')).toStrictEqual(['x', 'y']);
    expect(splitSearchOnComma('x,y,z')).toStrictEqual(['x', 'y', 'z']);
    expect(splitSearchOnComma('x,')).toStrictEqual(['x', '']);
    expect(splitSearchOnComma(',y')).toStrictEqual(['', 'y']);
    expect(splitSearchOnComma('x,,y')).toStrictEqual(['x', '', 'y']);
    expect(splitSearchOnComma('x\\,y')).toStrictEqual(['x,y']);
    expect(splitSearchOnComma('x\\,')).toStrictEqual(['x,']);
    expect(splitSearchOnComma('\\,y')).toStrictEqual([',y']);
    expect(splitSearchOnComma('x\\,,y')).toStrictEqual(['x,', 'y']);
  });

  test.each<[string, boolean]>([
    ['subject:Patient.name', true],
    ['_has:Observation:subject:status', true],
    ['name', false],
  ])('isChainedSearchFilter(%s)', (code, expected) => {
    expect(isChainedSearchFilter({ code, operator: Operator.EQUALS, value: 'x' })).toBe(expected);
  });

  test('Escape search value', () => {
    expect(escapeSearchValue('')).toStrictEqual('');
    expect(escapeSearchValue('x')).toStrictEqual('x');
    expect(escapeSearchValue('x,y')).toStrictEqual('x\\,y');
    expect(escapeSearchValue('x\\y')).toStrictEqual('x\\\\y');
    expect(escapeSearchValue('x\\,y')).toStrictEqual('x\\\\\\,y');
    for (const value of ['', 'x', 'x,y', ',', 'x,,y', 'x\\', 'x\\,y', '\\\\,']) {
      expect(splitSearchOnComma(escapeSearchValue(value))).toStrictEqual([value]);
    }
  });
});

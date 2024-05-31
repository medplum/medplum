import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { Bundle, Patient, SearchParameter } from '@medplum/fhirtypes';
import { indexSearchParameterBundle } from '../types';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import {
  Operator,
  SearchRequest,
  formatSearchQuery,
  parseSearchDefinition,
  parseSearchRequest,
  parseSearchUrl,
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

  test('parseSearchRequest', () => {
    expect(() => parseSearchRequest(null as unknown as string)).toThrow('Invalid search URL');
    expect(() => parseSearchRequest(undefined as unknown as string)).toThrow('Invalid search URL');
    expect(() => parseSearchRequest('')).toThrow('Invalid search URL');

    expect(parseSearchRequest('Patient')).toMatchObject({ resourceType: 'Patient' });
    expect(parseSearchRequest('Patient?name=alice')).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.EQUALS, value: 'alice' }],
    });
    expect(parseSearchRequest('Patient?_fields=id,name,birthDate')).toMatchObject({
      resourceType: 'Patient',
      fields: ['id', 'name', 'birthDate'],
    });

    expect(parseSearchRequest('Patient')).toMatchObject({ resourceType: 'Patient' });
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

    expect(parseSearchRequest(new URL('https://example.com/Patient'))).toMatchObject({ resourceType: 'Patient' });
    expect(parseSearchRequest(new URL('https://example.com/Patient?name=alice'))).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.EQUALS, value: 'alice' }],
    });
    expect(parseSearchRequest(new URL('https://example.com/Patient?_fields=id,name,birthDate'))).toMatchObject({
      resourceType: 'Patient',
      fields: ['id', 'name', 'birthDate'],
    });

    // Ignores _ query parameter in query string
    expect(parseSearchRequest(`Patient?name=Alice&_=${new Date().getTime()}`)).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Alice' }],
    });
  });

  test('parseSearchUrl', () => {
    expect(() => parseSearchUrl(null as unknown as URL)).toThrow('Invalid search URL');
    expect(() => parseSearchUrl(undefined as unknown as URL)).toThrow('Invalid search URL');

    expect(parseSearchUrl(new URL('https://example.com/Patient'))).toMatchObject({ resourceType: 'Patient' });
    expect(parseSearchUrl(new URL('https://example.com/Patient?name=alice'))).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.EQUALS, value: 'alice' }],
    });
    expect(parseSearchUrl(new URL('https://example.com/Patient?_fields=id,name,birthDate'))).toMatchObject({
      resourceType: 'Patient',
      fields: ['id', 'name', 'birthDate'],
    });
  });

  test('Parse Patient search', () => {
    const result = parseSearchDefinition('/x/y/z/Patient');
    expect(result.resourceType).toBe('Patient');
    expect(result.filters).toBeUndefined();
  });

  test('Parse Patient search with trailing slash', () => {
    const result = parseSearchDefinition('/Patient/');
    expect(result.resourceType).toBe('Patient');
    expect(result.filters).toBeUndefined();
  });

  test('Parse Patient search name', () => {
    const result = parseSearchDefinition('Patient?name=alice');
    expect(result.resourceType).toBe('Patient');
    expect(result.filters).toEqual([
      {
        code: 'name',
        operator: Operator.EQUALS,
        value: 'alice',
      },
    ]);
  });

  test('Parse Patient search fields', () => {
    const result = parseSearchDefinition('Patient?_fields=id,name,birthDate');
    expect(result.resourceType).toBe('Patient');
    expect(result.fields).toEqual(['id', 'name', 'birthDate']);
  });

  test('Parse Patient search sort', () => {
    const result = parseSearchDefinition('Patient?_sort=birthDate');
    expect(result.resourceType).toBe('Patient');
    expect(result.sortRules).toEqual([{ code: 'birthDate', descending: false }]);
  });

  test('Parse Patient search sort descending', () => {
    const result = parseSearchDefinition('Patient?_sort=-birthDate');
    expect(result.resourceType).toBe('Patient');
    expect(result.sortRules).toEqual([{ code: 'birthDate', descending: true }]);
  });

  test('Parse Patient search total', () => {
    const result = parseSearchDefinition('Patient?_total=accurate');
    expect(result.resourceType).toBe('Patient');
    expect(result.total).toBe('accurate');
  });

  test('Parse Patient count and offset', () => {
    const result = parseSearchDefinition('Patient?_count=10&_offset=20');
    expect(result.resourceType).toBe('Patient');
    expect(result.offset).toBe(20);
    expect(result.count).toBe(10);
  });

  test('Parse modifier operator', () => {
    const result = parseSearchDefinition('Patient?name:contains=alice');
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
    const result = parseSearchDefinition('Patient?birthdate=gt2000-01-01');
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
    const result = parseSearchDefinition('Patient?name=leslie');
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
    const result = parseSearchDefinition(
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

  test('Parse chained search parameters', () => {
    const searchReq = parseSearchDefinition(
      'Patient?organization.name=Kaiser%20Permanente&_has:Observation:subject:performer:Practitioner.name=Alice'
    );

    expect(searchReq).toMatchObject<SearchRequest>({
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
    });
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
    expect(result).toEqual('?_count=5&_fields=id,name&_offset=10&_total=accurate&name=alice');
  });

  test('Format empty search', () => {
    const result = formatSearchQuery({ resourceType: 'Patient' });
    expect(result).toEqual('');
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
    expect(result).toEqual('?_fields=id,name&_sort=name');
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
    expect(result).toEqual('?_fields=id,name&_sort=-name');
  });

  test('Format Patient search total', () => {
    const result = formatSearchQuery({
      resourceType: 'Patient',
      total: 'accurate',
    });
    expect(result).toEqual('?_total=accurate');
  });

  test('Format number not equals', () => {
    expect(
      formatSearchQuery({
        resourceType: 'RiskAssessment',
        filters: [{ code: 'probability', operator: Operator.NOT_EQUALS, value: '0.5' }],
      })
    ).toEqual('?probability=ne0.5');
  });

  test('Format number less than', () => {
    expect(
      formatSearchQuery({
        resourceType: 'RiskAssessment',
        filters: [{ code: 'probability', operator: Operator.LESS_THAN, value: '0.5' }],
      })
    ).toEqual('?probability=lt0.5');
  });

  test('Format number less than or equal', () => {
    expect(
      formatSearchQuery({
        resourceType: 'RiskAssessment',
        filters: [{ code: 'probability', operator: Operator.LESS_THAN_OR_EQUALS, value: '0.5' }],
      })
    ).toEqual('?probability=le0.5');
  });

  test('Format number greater than', () => {
    expect(
      formatSearchQuery({
        resourceType: 'RiskAssessment',
        filters: [{ code: 'probability', operator: Operator.GREATER_THAN, value: '0.5' }],
      })
    ).toEqual('?probability=gt0.5');
  });

  test('Format number greater than or equal', () => {
    expect(
      formatSearchQuery({
        resourceType: 'RiskAssessment',
        filters: [{ code: 'probability', operator: Operator.GREATER_THAN_OR_EQUALS, value: '0.5' }],
      })
    ).toEqual('?probability=ge0.5');
  });

  test('Format URL below', () => {
    expect(
      formatSearchQuery({
        resourceType: 'ValueSet',
        filters: [{ code: 'url', operator: Operator.BELOW, value: 'http://acme.org' }],
      })
    ).toEqual('?url:below=http%3A%2F%2Facme.org');
  });

  test('Format URL above', () => {
    expect(
      formatSearchQuery({
        resourceType: 'ValueSet',
        filters: [{ code: 'url', operator: Operator.ABOVE, value: 'http://acme.org' }],
      })
    ).toEqual('?url:above=http%3A%2F%2Facme.org');
  });

  test('Format token not', () => {
    expect(
      formatSearchQuery({
        resourceType: 'Condition',
        filters: [{ code: 'code', operator: Operator.NOT, value: 'x' }],
      })
    ).toEqual('?code:not=x');
  });

  test('Format token not', () => {
    expect(
      formatSearchQuery({
        resourceType: 'Condition',
        filters: [{ code: 'code', operator: Operator.NOT, value: 'x' }],
      })
    ).toEqual('?code:not=x');
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
    ).toEqual('?_include=Patient:organization');
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
    ).toEqual('?_include:iterate=Patient:organization');
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
    expect(actual).toEqual(expected);
  });

  test('Split search value on comma', () => {
    expect(splitSearchOnComma('')).toEqual(['']);
    expect(splitSearchOnComma('x')).toEqual(['x']);
    expect(splitSearchOnComma('x,y')).toEqual(['x', 'y']);
    expect(splitSearchOnComma('x,y,z')).toEqual(['x', 'y', 'z']);
    expect(splitSearchOnComma('x,')).toEqual(['x', '']);
    expect(splitSearchOnComma(',y')).toEqual(['', 'y']);
    expect(splitSearchOnComma('x,,y')).toEqual(['x', '', 'y']);
    expect(splitSearchOnComma('x\\,y')).toEqual(['x,y']);
    expect(splitSearchOnComma('x\\,')).toEqual(['x,']);
    expect(splitSearchOnComma('\\,y')).toEqual([',y']);
    expect(splitSearchOnComma('x\\,,y')).toEqual(['x,', 'y']);
  });
});

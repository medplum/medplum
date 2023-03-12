import { readJson } from '@medplum/definitions';
import { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '../types';
import { Operator, parseSearchRequest, parseSearchUrl } from './search';

describe('Search parser', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  test('Parse Patient search', () => {
    expect(parseSearchRequest('Patient', {})).toMatchObject({
      resourceType: 'Patient',
    });
  });

  test('Parse Patient _id', () => {
    expect(parseSearchRequest('Patient', { _id: '1' })).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: '_id', operator: Operator.EQUALS, value: '1' }],
    });
  });

  test('Parse _account', () => {
    expect(parseSearchUrl(new URL('https://example.com/fhir/R4/Patient?_account=123'))).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: '_account', operator: Operator.EQUALS, value: '123' }],
    });
  });

  test('Parse _account:not', () => {
    expect(parseSearchUrl(new URL('https://example.com/fhir/R4/Patient?_account:not=123'))).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: '_account', operator: Operator.NOT, value: '123' }],
    });
  });

  test('Parse _account not equals', () => {
    expect(parseSearchUrl(new URL('https://example.com/fhir/R4/Patient?_account=ne123'))).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: '_account', operator: Operator.NOT_EQUALS, value: '123' }],
    });
  });

  test('Parse Patient _id:not', () => {
    expect(parseSearchUrl(new URL('https://example.com/fhir/R4/Patient?_id:not=1'))).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: '_id', operator: Operator.NOT, value: '1' }],
    });
  });

  test('Parse name without value', () => {
    expect(parseSearchRequest('Patient', { name: undefined })).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.EQUALS, value: '' }],
    });
  });

  test('Parse Patient name search', () => {
    expect(parseSearchRequest('Patient', { name: 'Homer' })).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Homer' }],
    });
  });

  test('Parse Patient name missing', () => {
    expect(parseSearchRequest('Patient', { 'name:missing': 'true' })).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.MISSING, value: 'true' }],
    });
  });

  test('Parse count and offset', () => {
    expect(parseSearchRequest('Patient', { _count: '5', _offset: '10' })).toMatchObject({
      resourceType: 'Patient',
      count: 5,
      offset: 10,
    });
  });

  test('Parse total', () => {
    expect(parseSearchRequest('Patient', { _total: 'none' })).toMatchObject({
      resourceType: 'Patient',
      total: 'none',
    });
    expect(parseSearchRequest('Patient', { _total: 'accurate' })).toMatchObject({
      resourceType: 'Patient',
      total: 'accurate',
    });
    expect(parseSearchRequest('Patient', { _total: 'estimate' })).toMatchObject({
      resourceType: 'Patient',
      total: 'estimate',
    });
  });

  test('Parse summary', () => {
    expect(parseSearchRequest('Patient', { _summary: 'true' })).toMatchObject({
      resourceType: 'Patient',
      total: 'estimate',
      count: 0,
    });
  });

  test('Parse URL', () => {
    expect(parseSearchUrl(new URL('https://example.com/Patient?name=Alice'))).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'Alice',
        },
      ],
    });
  });

  // Number

  test('Parse search number equals', () => {
    expect(parseSearchRequest('RiskAssessment', { probability: '0.5' })).toMatchObject({
      resourceType: 'RiskAssessment',
      filters: [{ code: 'probability', operator: Operator.EQUALS, value: '0.5' }],
    });
  });

  test('Parse search number explicit equals', () => {
    expect(parseSearchRequest('RiskAssessment', { probability: 'eq0.5' })).toMatchObject({
      resourceType: 'RiskAssessment',
      filters: [{ code: 'probability', operator: Operator.EQUALS, value: '0.5' }],
    });
  });

  test('Parse search number not equals', () => {
    expect(parseSearchRequest('RiskAssessment', { probability: 'ne0.5' })).toMatchObject({
      resourceType: 'RiskAssessment',
      filters: [{ code: 'probability', operator: Operator.NOT_EQUALS, value: '0.5' }],
    });
  });

  test('Parse search number less than', () => {
    expect(parseSearchRequest('RiskAssessment', { probability: 'lt0.5' })).toMatchObject({
      resourceType: 'RiskAssessment',
      filters: [{ code: 'probability', operator: Operator.LESS_THAN, value: '0.5' }],
    });
  });

  test('Parse search number less than or equal', () => {
    expect(parseSearchRequest('RiskAssessment', { probability: 'le0.5' })).toMatchObject({
      resourceType: 'RiskAssessment',
      filters: [
        {
          code: 'probability',
          operator: Operator.LESS_THAN_OR_EQUALS,
          value: '0.5',
        },
      ],
    });
  });

  test('Parse search number greater than', () => {
    expect(parseSearchRequest('RiskAssessment', { probability: 'gt0.5' })).toMatchObject({
      resourceType: 'RiskAssessment',
      filters: [{ code: 'probability', operator: Operator.GREATER_THAN, value: '0.5' }],
    });
  });

  test('Parse search number greater than or equal', () => {
    expect(parseSearchRequest('RiskAssessment', { probability: 'ge0.5' })).toMatchObject({
      resourceType: 'RiskAssessment',
      filters: [
        {
          code: 'probability',
          operator: Operator.GREATER_THAN_OR_EQUALS,
          value: '0.5',
        },
      ],
    });
  });

  // Date

  test('Parse search date equals', () => {
    expect(parseSearchRequest('Procedure', { date: '2020-01-01' })).toMatchObject({
      resourceType: 'Procedure',
      filters: [{ code: 'date', operator: Operator.EQUALS, value: '2020-01-01' }],
    });
  });

  test('Parse search date explicit equals', () => {
    expect(parseSearchRequest('Procedure', { date: 'eq2020-01-01' })).toMatchObject({
      resourceType: 'Procedure',
      filters: [{ code: 'date', operator: Operator.EQUALS, value: '2020-01-01' }],
    });
  });

  test('Parse search date not equals', () => {
    expect(parseSearchRequest('Procedure', { date: 'ne2020-01-01' })).toMatchObject({
      resourceType: 'Procedure',
      filters: [{ code: 'date', operator: Operator.NOT_EQUALS, value: '2020-01-01' }],
    });
  });

  test('Parse search date less than', () => {
    expect(parseSearchRequest('Procedure', { date: 'lt2020-01-01' })).toMatchObject({
      resourceType: 'Procedure',
      filters: [{ code: 'date', operator: Operator.LESS_THAN, value: '2020-01-01' }],
    });
  });

  test('Parse search date less than or equal', () => {
    expect(parseSearchRequest('Procedure', { date: 'le2020-01-01' })).toMatchObject({
      resourceType: 'Procedure',
      filters: [
        {
          code: 'date',
          operator: Operator.LESS_THAN_OR_EQUALS,
          value: '2020-01-01',
        },
      ],
    });
  });

  test('Parse search date greater than', () => {
    expect(parseSearchRequest('Procedure', { date: 'gt2020-01-01' })).toMatchObject({
      resourceType: 'Procedure',
      filters: [{ code: 'date', operator: Operator.GREATER_THAN, value: '2020-01-01' }],
    });
  });

  test('Parse search date greater than or equal', () => {
    expect(parseSearchRequest('Procedure', { date: 'ge2020-01-01' })).toMatchObject({
      resourceType: 'Procedure',
      filters: [
        {
          code: 'date',
          operator: Operator.GREATER_THAN_OR_EQUALS,
          value: '2020-01-01',
        },
      ],
    });
  });

  test('Parse search date starts after', () => {
    expect(parseSearchRequest('Procedure', { date: 'sa2020-01-01' })).toMatchObject({
      resourceType: 'Procedure',
      filters: [{ code: 'date', operator: Operator.STARTS_AFTER, value: '2020-01-01' }],
    });
  });

  test('Parse search date ends before', () => {
    expect(parseSearchRequest('Procedure', { date: 'eb2020-01-01' })).toMatchObject({
      resourceType: 'Procedure',
      filters: [{ code: 'date', operator: Operator.ENDS_BEFORE, value: '2020-01-01' }],
    });
  });

  test('Parse search date approximately', () => {
    expect(parseSearchRequest('Procedure', { date: 'ap2020-01-01' })).toMatchObject({
      resourceType: 'Procedure',
      filters: [{ code: 'date', operator: Operator.APPROXIMATELY, value: '2020-01-01' }],
    });
  });

  // String

  test('Parse search string contains', () => {
    expect(parseSearchRequest('Patient', { 'name:contains': 'Alice' })).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.CONTAINS, value: 'Alice' }],
    });
  });

  test('Parse search string exact', () => {
    expect(parseSearchRequest('Patient', { 'name:exact': 'Alice' })).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'name', operator: Operator.EXACT, value: 'Alice' }],
    });
  });

  // Token

  test('Parse search token text', () => {
    expect(parseSearchRequest('Patient', { 'email:text': 'alice@example.com' })).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'email', operator: Operator.TEXT, value: 'alice@example.com' }],
    });
  });

  test('Parse search token exact', () => {
    expect(parseSearchRequest('Patient', { 'email:not': 'alice@example.com' })).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: 'email',
          operator: Operator.NOT,
          value: 'alice@example.com',
        },
      ],
    });
  });

  test('Parse search token above', () => {
    expect(parseSearchRequest('Patient', { 'email:above': 'alice@example.com' })).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'email', operator: Operator.ABOVE, value: 'alice@example.com' }],
    });
  });

  test('Parse search token below', () => {
    expect(parseSearchRequest('Patient', { 'email:below': 'alice@example.com' })).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'email', operator: Operator.BELOW, value: 'alice@example.com' }],
    });
  });

  test('Parse search token in', () => {
    expect(parseSearchRequest('Patient', { 'email:in': 'alice@example.com' })).toMatchObject({
      resourceType: 'Patient',
      filters: [{ code: 'email', operator: Operator.IN, value: 'alice@example.com' }],
    });
  });

  test('Parse search token not-in', () => {
    expect(parseSearchRequest('Patient', { 'email:not-in': 'alice@example.com' })).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: 'email',
          operator: Operator.NOT_IN,
          value: 'alice@example.com',
        },
      ],
    });
  });

  test('Parse search token of-type', () => {
    expect(parseSearchRequest('Patient', { 'email:of-type': 'alice@example.com' })).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: 'email',
          operator: Operator.OF_TYPE,
          value: 'alice@example.com',
        },
      ],
    });
  });

  // Reference

  test('Parse search reference', () => {
    expect(parseSearchRequest('Observation', { subject: 'Patient/123' })).toMatchObject({
      resourceType: 'Observation',
      filters: [{ code: 'subject', operator: Operator.EQUALS, value: 'Patient/123' }],
    });
  });

  test('Parse reference identifier', () => {
    expect(
      parseSearchRequest('Observation', { 'subject:identifier': 'http://acme.org/fhir/identifier/mrn|123456' })
    ).toMatchObject({
      resourceType: 'Observation',
      filters: [
        { code: 'subject', operator: Operator.IDENTIFIER, value: 'http://acme.org/fhir/identifier/mrn|123456' },
      ],
    });
  });

  // Quantity

  test('Parse search quantity equals', () => {
    expect(parseSearchRequest('Observation', { 'value-quantity': '0.5' })).toMatchObject({
      resourceType: 'Observation',
      filters: [{ code: 'value-quantity', operator: Operator.EQUALS, value: '0.5' }],
    });
  });

  test('Parse search quantity explicit equals', () => {
    expect(parseSearchRequest('Observation', { 'value-quantity': 'eq0.5' })).toMatchObject({
      resourceType: 'Observation',
      filters: [{ code: 'value-quantity', operator: Operator.EQUALS, value: '0.5' }],
    });
  });

  test('Parse search quantity not equals', () => {
    expect(parseSearchRequest('Observation', { 'value-quantity': 'ne0.5' })).toMatchObject({
      resourceType: 'Observation',
      filters: [{ code: 'value-quantity', operator: Operator.NOT_EQUALS, value: '0.5' }],
    });
  });

  test('Parse search quantity less than', () => {
    expect(parseSearchRequest('Observation', { 'value-quantity': 'lt0.5' })).toMatchObject({
      resourceType: 'Observation',
      filters: [{ code: 'value-quantity', operator: Operator.LESS_THAN, value: '0.5' }],
    });
  });

  test('Parse search quantity less than or equal', () => {
    expect(parseSearchRequest('Observation', { 'value-quantity': 'le0.5' })).toMatchObject({
      resourceType: 'Observation',
      filters: [
        {
          code: 'value-quantity',
          operator: Operator.LESS_THAN_OR_EQUALS,
          value: '0.5',
        },
      ],
    });
  });

  test('Parse search quantity greater than', () => {
    expect(parseSearchRequest('Observation', { 'value-quantity': 'gt0.5' })).toMatchObject({
      resourceType: 'Observation',
      filters: [
        {
          code: 'value-quantity',
          operator: Operator.GREATER_THAN,
          value: '0.5',
        },
      ],
    });
  });

  test('Parse search quantity greater than or equal', () => {
    expect(parseSearchRequest('Observation', { 'value-quantity': 'ge0.5' })).toMatchObject({
      resourceType: 'Observation',
      filters: [
        {
          code: 'value-quantity',
          operator: Operator.GREATER_THAN_OR_EQUALS,
          value: '0.5',
        },
      ],
    });
  });

  test('Parse search quantity units', () => {
    expect(
      parseSearchRequest('Observation', {
        'value-quantity': '5.4|https://unitsofmeasure.org|mg',
      })
    ).toMatchObject({
      resourceType: 'Observation',
      filters: [
        {
          code: 'value-quantity',
          operator: Operator.EQUALS,
          value: '5.4',
          unitSystem: 'https://unitsofmeasure.org',
          unitCode: 'mg',
        },
      ],
    });
  });

  // URI

  test('Parse search URI contains', () => {
    expect(parseSearchRequest('ValueSet', { 'url:contains': 'https://acme.org' })).toMatchObject({
      resourceType: 'ValueSet',
      filters: [{ code: 'url', operator: Operator.CONTAINS, value: 'https://acme.org' }],
    });
  });

  test('Parse search URI exact', () => {
    expect(parseSearchRequest('ValueSet', { 'url:exact': 'https://acme.org' })).toMatchObject({
      resourceType: 'ValueSet',
      filters: [{ code: 'url', operator: Operator.EXACT, value: 'https://acme.org' }],
    });
  });

  test('Parse search URI above', () => {
    expect(parseSearchRequest('ValueSet', { 'url:above': 'https://acme.org' })).toMatchObject({
      resourceType: 'ValueSet',
      filters: [{ code: 'url', operator: Operator.ABOVE, value: 'https://acme.org' }],
    });
  });

  test('Parse search URI below', () => {
    expect(parseSearchRequest('ValueSet', { 'url:below': 'https://acme.org' })).toMatchObject({
      resourceType: 'ValueSet',
      filters: [{ code: 'url', operator: Operator.BELOW, value: 'https://acme.org' }],
    });
  });

  // Sorting

  test('Parse search sort ascending', () => {
    expect(parseSearchRequest('Patient', { _sort: 'name' })).toMatchObject({
      resourceType: 'Patient',
      sortRules: [
        {
          code: 'name',
          descending: false,
        },
      ],
    });
  });

  test('Parse search sort descending', () => {
    expect(parseSearchRequest('Patient', { _sort: '-name' })).toMatchObject({
      resourceType: 'Patient',
      sortRules: [
        {
          code: 'name',
          descending: true,
        },
      ],
    });
  });

  test('Parse search sort multiple rules', () => {
    expect(parseSearchRequest('Patient', { _sort: 'name,birthdate' })).toMatchObject({
      resourceType: 'Patient',
      sortRules: [
        {
          code: 'name',
          descending: false,
        },
        {
          code: 'birthdate',
          descending: false,
        },
      ],
    });
  });

  // Other

  test('Multiple filters on same field', () => {
    expect(parseSearchRequest('Patient', { _lastUpdated: ['gt2019-01-01', 'lt2019-01-02'] })).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: '_lastUpdated',
          operator: Operator.GREATER_THAN,
          value: '2019-01-01',
        },
        {
          code: '_lastUpdated',
          operator: Operator.LESS_THAN,
          value: '2019-01-02',
        },
      ],
    });
  });

  test('_revinclude', () => {
    expect(parseSearchRequest('Patient', { _revinclude: 'Provenance:target' })).toMatchObject({
      resourceType: 'Patient',
      revInclude: 'Provenance:target',
    });
  });
});

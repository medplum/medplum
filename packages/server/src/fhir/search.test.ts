import { Operator } from '@medplum/core';
import { getSearchParameters, parseSearchRequest } from './search';

test('Parse Patient search', () => {
  expect(parseSearchRequest('Patient', {})).toMatchObject({
    resourceType: 'Patient',
    sortRules: [],
    filters: []
  });
});

test('Parse Patient id', () => {
  expect(parseSearchRequest('Patient', { id: '1' })).toMatchObject({
    resourceType: 'Patient',
    sortRules: [],
    filters: [{ code: '_id', operator: Operator.EQUALS, value: '1' }]
  });
});

test('Parse Patient _id', () => {
  expect(parseSearchRequest('Patient', { _id: '1' })).toMatchObject({
    resourceType: 'Patient',
    sortRules: [],
    filters: [{ code: '_id', operator: Operator.EQUALS, value: '1' }]
  });
});

test('Parse Patient name search', () => {
  expect(parseSearchRequest('Patient', { name: 'Homer' })).toMatchObject({
    resourceType: 'Patient',
    sortRules: [],
    filters: [{ code: 'name', operator: Operator.EQUALS, value: 'Homer' }]
  });
});

test('Parse page and count', () => {
  expect(parseSearchRequest('Patient', { _page: '3', _count: '7' })).toMatchObject({
    resourceType: 'Patient',
    page: 3,
    count: 7
  });
});

test('Patient has birthdate param', () => {
  const params = getSearchParameters('Patient');
  expect(params['birthdate']).not.toBeUndefined();
});

// Number

test('Parse search number equals', () => {
  expect(parseSearchRequest('RiskAssessment', { 'probability': '0.5' })).toMatchObject({
    resourceType: 'RiskAssessment',
    filters: [{ code: 'probability', operator: Operator.EQUALS, value: '0.5' }]
  });
});

test('Parse search number explicit equals', () => {
  expect(parseSearchRequest('RiskAssessment', { 'probability': 'eq0.5' })).toMatchObject({
    resourceType: 'RiskAssessment',
    filters: [{ code: 'probability', operator: Operator.EQUALS, value: '0.5' }]
  });
});

test('Parse search number not equals', () => {
  expect(parseSearchRequest('RiskAssessment', { 'probability': 'ne0.5' })).toMatchObject({
    resourceType: 'RiskAssessment',
    filters: [{ code: 'probability', operator: Operator.NOT_EQUALS, value: '0.5' }]
  });
});

test('Parse search number less than', () => {
  expect(parseSearchRequest('RiskAssessment', { 'probability': 'lt0.5' })).toMatchObject({
    resourceType: 'RiskAssessment',
    filters: [{ code: 'probability', operator: Operator.LESS_THAN, value: '0.5' }]
  });
});

test('Parse search number less than or equal', () => {
  expect(parseSearchRequest('RiskAssessment', { 'probability': 'le0.5' })).toMatchObject({
    resourceType: 'RiskAssessment',
    filters: [{ code: 'probability', operator: Operator.LESS_THAN_OR_EQUALS, value: '0.5' }]
  });
});

test('Parse search number greater than', () => {
  expect(parseSearchRequest('RiskAssessment', { 'probability': 'gt0.5' })).toMatchObject({
    resourceType: 'RiskAssessment',
    filters: [{ code: 'probability', operator: Operator.GREATER_THAN, value: '0.5' }]
  });
});

test('Parse search number greater than or equal', () => {
  expect(parseSearchRequest('RiskAssessment', { 'probability': 'ge0.5' })).toMatchObject({
    resourceType: 'RiskAssessment',
    filters: [{ code: 'probability', operator: Operator.GREATER_THAN_OR_EQUALS, value: '0.5' }]
  });
});

// Date

test('Parse search date equals', () => {
  expect(parseSearchRequest('Procedure', { 'date': '2020-01-01' })).toMatchObject({
    resourceType: 'Procedure',
    filters: [{ code: 'date', operator: Operator.EQUALS, value: '2020-01-01' }]
  });
});

test('Parse search date explicit equals', () => {
  expect(parseSearchRequest('Procedure', { 'date': 'eq2020-01-01' })).toMatchObject({
    resourceType: 'Procedure',
    filters: [{ code: 'date', operator: Operator.EQUALS, value: '2020-01-01' }]
  });
});

test('Parse search date not equals', () => {
  expect(parseSearchRequest('Procedure', { 'date': 'ne2020-01-01' })).toMatchObject({
    resourceType: 'Procedure',
    filters: [{ code: 'date', operator: Operator.NOT_EQUALS, value: '2020-01-01' }]
  });
});

test('Parse search date less than', () => {
  expect(parseSearchRequest('Procedure', { 'date': 'lt2020-01-01' })).toMatchObject({
    resourceType: 'Procedure',
    filters: [{ code: 'date', operator: Operator.LESS_THAN, value: '2020-01-01' }]
  });
});

test('Parse search date less than or equal', () => {
  expect(parseSearchRequest('Procedure', { 'date': 'le2020-01-01' })).toMatchObject({
    resourceType: 'Procedure',
    filters: [{ code: 'date', operator: Operator.LESS_THAN_OR_EQUALS, value: '2020-01-01' }]
  });
});

test('Parse search date greater than', () => {
  expect(parseSearchRequest('Procedure', { 'date': 'gt2020-01-01' })).toMatchObject({
    resourceType: 'Procedure',
    filters: [{ code: 'date', operator: Operator.GREATER_THAN, value: '2020-01-01' }]
  });
});

test('Parse search date greater than or equal', () => {
  expect(parseSearchRequest('Procedure', { 'date': 'ge2020-01-01' })).toMatchObject({
    resourceType: 'Procedure',
    filters: [{ code: 'date', operator: Operator.GREATER_THAN_OR_EQUALS, value: '2020-01-01' }]
  });
});

test('Parse search date starts after', () => {
  expect(parseSearchRequest('Procedure', { 'date': 'sa2020-01-01' })).toMatchObject({
    resourceType: 'Procedure',
    filters: [{ code: 'date', operator: Operator.STARTS_AFTER, value: '2020-01-01' }]
  });
});

test('Parse search date ends before', () => {
  expect(parseSearchRequest('Procedure', { 'date': 'eb2020-01-01' })).toMatchObject({
    resourceType: 'Procedure',
    filters: [{ code: 'date', operator: Operator.ENDS_BEFORE, value: '2020-01-01' }]
  });
});

test('Parse search date approximately', () => {
  expect(parseSearchRequest('Procedure', { 'date': 'ap2020-01-01' })).toMatchObject({
    resourceType: 'Procedure',
    filters: [{ code: 'date', operator: Operator.APPROXIMATELY, value: '2020-01-01' }]
  });
});

// String

test('Parse search string contains', () => {
  expect(parseSearchRequest('Patient', { 'name:contains': 'Alice' })).toMatchObject({
    resourceType: 'Patient',
    filters: [{ code: 'name', operator: Operator.CONTAINS, value: 'Alice' }]
  });
});

test('Parse search string exact', () => {
  expect(parseSearchRequest('Patient', { 'name:exact': 'Alice' })).toMatchObject({
    resourceType: 'Patient',
    filters: [{ code: 'name', operator: Operator.EXACT, value: 'Alice' }]
  });
});

// Token

test('Parse search token text', () => {
  expect(parseSearchRequest('Patient', { 'email:text': 'alice@example.com' })).toMatchObject({
    resourceType: 'Patient',
    filters: [{ code: 'email', operator: Operator.TEXT, value: 'alice@example.com' }]
  });
});

test('Parse search token exact', () => {
  expect(parseSearchRequest('Patient', { 'email:not': 'alice@example.com' })).toMatchObject({
    resourceType: 'Patient',
    filters: [{ code: 'email', operator: Operator.NOT_EQUALS, value: 'alice@example.com' }]
  });
});

test('Parse search token above', () => {
  expect(parseSearchRequest('Patient', { 'email:above': 'alice@example.com' })).toMatchObject({
    resourceType: 'Patient',
    filters: [{ code: 'email', operator: Operator.ABOVE, value: 'alice@example.com' }]
  });
});

test('Parse search token below', () => {
  expect(parseSearchRequest('Patient', { 'email:below': 'alice@example.com' })).toMatchObject({
    resourceType: 'Patient',
    filters: [{ code: 'email', operator: Operator.BELOW, value: 'alice@example.com' }]
  });
});

test('Parse search token in', () => {
  expect(parseSearchRequest('Patient', { 'email:in': 'alice@example.com' })).toMatchObject({
    resourceType: 'Patient',
    filters: [{ code: 'email', operator: Operator.IN, value: 'alice@example.com' }]
  });
});

test('Parse search token not-in', () => {
  expect(parseSearchRequest('Patient', { 'email:not-in': 'alice@example.com' })).toMatchObject({
    resourceType: 'Patient',
    filters: [{ code: 'email', operator: Operator.NOT_IN, value: 'alice@example.com' }]
  });
});

test('Parse search token of-type', () => {
  expect(parseSearchRequest('Patient', { 'email:of-type': 'alice@example.com' })).toMatchObject({
    resourceType: 'Patient',
    filters: [{ code: 'email', operator: Operator.OF_TYPE, value: 'alice@example.com' }]
  });
});

// Reference

test('Parse search reference', () => {
  expect(parseSearchRequest('Observation', { 'subject': 'Patient/123' })).toMatchObject({
    resourceType: 'Observation',
    filters: [{ code: 'subject', operator: Operator.EQUALS, value: 'Patient/123' }]
  });
});

// Sorting

test('Parse search sort ascending', () => {
  expect(parseSearchRequest('Patient', { _sort: 'name' })).toMatchObject({
    resourceType: 'Patient',
    sortRules: [{
      code: 'name',
      descending: false
    }],
    filters: []
  });
});

test('Parse search sort descending', () => {
  expect(parseSearchRequest('Patient', { _sort: '-name' })).toMatchObject({
    resourceType: 'Patient',
    sortRules: [{
      code: 'name',
      descending: true
    }],
    filters: []
  });
});

test('Parse search sort multiple rules', () => {
  expect(parseSearchRequest('Patient', { _sort: 'name,birthdate' })).toMatchObject({
    resourceType: 'Patient',
    sortRules: [{
      code: 'name',
      descending: false
    }, {
      code: 'birthdate',
      descending: false
    }],
    filters: []
  });
});

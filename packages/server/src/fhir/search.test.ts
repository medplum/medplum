import { Operator } from '@medplum/core';
import { parseSearchRequest } from './search';

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

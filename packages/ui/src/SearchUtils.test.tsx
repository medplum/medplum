import { Filter, Operator, SearchRequest } from '@medplum/core';
import { addField, addFilter, clearFilters, clearFiltersOnField, setFilters } from './SearchUtils';

test('Set filters', () => {
  const original: SearchRequest = {
    resourceType: 'Patient',
    filters: [{
      code: 'name',
      operator: Operator.EQUALS,
      value: 'eve'
    }]
  };
  const filters: Filter[] = [{
    code: 'name',
    operator: Operator.EQUALS,
    value: 'alice'
  }];
  const result = setFilters(original, filters);
  expect(result.filters?.length).toBe(1);
  expect(result.filters?.[0].value).toBe('alice');
});

test('Clear filters', () => {
  const original: SearchRequest = {
    resourceType: 'Patient',
    filters: [{
      code: 'name',
      operator: Operator.EQUALS,
      value: 'eve'
    }]
  };
  const result = clearFilters(original);
  expect(result.filters?.length).toBe(0);
});

test('Clear filters on field', () => {
  const original: SearchRequest = {
    resourceType: 'Patient',
    filters: [{
      code: 'name',
      operator: Operator.EQUALS,
      value: 'eve'
    }]
  };
  const result = clearFiltersOnField(original, 'name');
  expect(result.filters?.length).toBe(0);
});

test('Add filters', () => {
  const original: SearchRequest = {
    resourceType: 'Patient',
    filters: [{
      code: 'name',
      operator: Operator.EQUALS,
      value: 'eve'
    }]
  };
  const result = addFilter(original, 'name', Operator.EQUALS, 'alice');
  expect(result.filters?.length).toBe(2);
  expect(result.filters?.[0].value).toBe('eve');
  expect(result.filters?.[1].value).toBe('alice');
});

test('Add filters with clear option', () => {
  const original: SearchRequest = {
    resourceType: 'Patient',
    filters: [{
      code: 'name',
      operator: Operator.EQUALS,
      value: 'eve'
    }]
  };
  const result = addFilter(original, 'name', Operator.EQUALS, 'alice', true);
  expect(result.filters?.length).toBe(1);
  expect(result.filters?.[0].value).toBe('alice');
});

test('Add field', () => {
  const original: SearchRequest = {
    resourceType: 'Patient',
    filters: [],
    fields: ['id', 'name']
  };
  const result = addField(original, 'birthDate');
  expect(result.fields).toEqual(['id', 'name', 'birthDate']);
});

test('Add existing field', () => {
  const original: SearchRequest = {
    resourceType: 'Patient',
    filters: [],
    fields: ['id', 'name']
  };
  const result = addField(original, 'name');
  expect(result.fields).toEqual(['id', 'name']);
});

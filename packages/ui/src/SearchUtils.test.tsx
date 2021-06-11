import { Filter, Operator, SearchRequest } from '@medplum/core';
import { setFilters } from './SearchUtils';

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
  expect(result.filters[0].value).toBe('alice');
});

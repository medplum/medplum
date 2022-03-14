import { Filter, Operator, SearchRequest, TypeSchema } from '@medplum/core';
import {
  addField,
  addFilter,
  addLastMonthFilter,
  addNextMonthFilter,
  addThisMonthFilter,
  addTodayFilter,
  addTomorrowFilter,
  addYearToDateFilter,
  addYesterdayFilter,
  buildFieldNameString,
  clearFilters,
  clearFiltersOnField,
  deleteFilter,
  getSortField,
  isSortDescending,
  setFilters,
  setPage,
  setSort,
  toggleSort,
} from './SearchUtils';

describe('SearchUtils', () => {
  test('Set filters', () => {
    const original: SearchRequest = {
      resourceType: 'Patient',
      page: 2,
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'eve',
        },
      ],
    };
    const filters: Filter[] = [
      {
        code: 'name',
        operator: Operator.EQUALS,
        value: 'alice',
      },
    ];
    const result = setFilters(original, filters);
    expect(result.filters?.length).toBe(1);
    expect(result.filters?.[0].value).toBe('alice');
    expect(result.page).toBe(0);
  });

  test('Clear filters', () => {
    const original: SearchRequest = {
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'eve',
        },
      ],
    };
    const result = clearFilters(original);
    expect(result.filters?.length).toBe(0);
  });

  test('Clear filters on field', () => {
    const original: SearchRequest = {
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'eve',
        },
      ],
    };
    const result = clearFiltersOnField(original, 'name');
    expect(result.filters?.length).toBe(0);
  });

  test('Add filters', () => {
    const original: SearchRequest = {
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'eve',
        },
      ],
    };
    const result = addFilter(original, 'name', Operator.EQUALS, 'alice');
    expect(result.filters?.length).toBe(2);
    expect(result.filters?.[0].value).toBe('eve');
    expect(result.filters?.[1].value).toBe('alice');
  });

  test('Add filters with clear option', () => {
    const original: SearchRequest = {
      resourceType: 'Patient',
      filters: [
        {
          code: 'name',
          operator: Operator.EQUALS,
          value: 'eve',
        },
      ],
    };
    const result = addFilter(original, 'name', Operator.EQUALS, 'alice', true);
    expect(result.filters?.length).toBe(1);
    expect(result.filters?.[0].value).toBe('alice');
  });

  test('Add field', () => {
    const original: SearchRequest = {
      resourceType: 'Patient',
      filters: [],
      fields: ['id', 'name'],
    };
    const result = addField(original, 'birthDate');
    expect(result.fields).toEqual(['id', 'name', 'birthDate']);
  });

  test('Add existing field', () => {
    const original: SearchRequest = {
      resourceType: 'Patient',
      filters: [],
      fields: ['id', 'name'],
    };
    const result = addField(original, 'name');
    expect(result.fields).toEqual(['id', 'name']);
  });

  test('Delete filter', () => {
    expect(deleteFilter({ resourceType: 'Patient' }, 0)).toEqual({
      resourceType: 'Patient',
    });

    expect(
      deleteFilter(
        {
          resourceType: 'Patient',
          filters: [
            {
              code: 'name',
              operator: Operator.EQUALS,
              value: 'eve',
            },
          ],
        },
        0
      )
    ).toEqual({
      resourceType: 'Patient',
      filters: [],
    });
  });

  test('Add yesterday filter', () => {
    expect(addYesterdayFilter({ resourceType: 'Patient' }, '_lastUpdated')).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: '_lastUpdated',
          operator: Operator.GREATER_THAN_OR_EQUALS,
        },
        {
          code: '_lastUpdated',
          operator: Operator.LESS_THAN_OR_EQUALS,
        },
      ],
    });
  });

  test('Add today filter', () => {
    expect(addTodayFilter({ resourceType: 'Patient' }, '_lastUpdated')).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: '_lastUpdated',
          operator: Operator.GREATER_THAN_OR_EQUALS,
        },
        {
          code: '_lastUpdated',
          operator: Operator.LESS_THAN_OR_EQUALS,
        },
      ],
    });
  });

  test('Add tomorrow filter', () => {
    expect(addTomorrowFilter({ resourceType: 'Patient' }, '_lastUpdated')).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: '_lastUpdated',
          operator: Operator.GREATER_THAN_OR_EQUALS,
        },
        {
          code: '_lastUpdated',
          operator: Operator.LESS_THAN_OR_EQUALS,
        },
      ],
    });
  });

  test('Add last month filter', () => {
    expect(addLastMonthFilter({ resourceType: 'Patient' }, '_lastUpdated')).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: '_lastUpdated',
          operator: Operator.GREATER_THAN_OR_EQUALS,
        },
        {
          code: '_lastUpdated',
          operator: Operator.LESS_THAN_OR_EQUALS,
        },
      ],
    });
  });

  test('Add this month filter', () => {
    expect(addThisMonthFilter({ resourceType: 'Patient' }, '_lastUpdated')).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: '_lastUpdated',
          operator: Operator.GREATER_THAN_OR_EQUALS,
        },
        {
          code: '_lastUpdated',
          operator: Operator.LESS_THAN_OR_EQUALS,
        },
      ],
    });
  });

  test('Add next month filter', () => {
    expect(addNextMonthFilter({ resourceType: 'Patient' }, '_lastUpdated')).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: '_lastUpdated',
          operator: Operator.GREATER_THAN_OR_EQUALS,
        },
        {
          code: '_lastUpdated',
          operator: Operator.LESS_THAN_OR_EQUALS,
        },
      ],
    });
  });

  test('Add year to date filter', () => {
    expect(addYearToDateFilter({ resourceType: 'Patient' }, '_lastUpdated')).toMatchObject({
      resourceType: 'Patient',
      filters: [
        {
          code: '_lastUpdated',
          operator: Operator.GREATER_THAN_OR_EQUALS,
        },
        {
          code: '_lastUpdated',
          operator: Operator.LESS_THAN_OR_EQUALS,
        },
      ],
    });
  });

  test('Set page', () => {
    expect(setPage({ resourceType: 'Patient' }, 1)).toMatchObject({
      resourceType: 'Patient',
      page: 1,
    });
    expect(setPage({ resourceType: 'Patient', page: 2 }, 2)).toMatchObject({
      resourceType: 'Patient',
      page: 2,
    });
    expect(setPage({ resourceType: 'Patient', page: 3 }, 4)).toMatchObject({
      resourceType: 'Patient',
      page: 4,
    });
  });

  test('Set sort', () => {
    expect(setSort({ resourceType: 'Patient' }, 'name')).toMatchObject({
      resourceType: 'Patient',
      sortRules: [
        {
          code: 'name',
          descending: false,
        },
      ],
    });

    expect(setSort({ resourceType: 'Patient', sortRules: [{ code: 'name' }] }, 'name')).toMatchObject({
      resourceType: 'Patient',
      sortRules: [
        {
          code: 'name',
          descending: false,
        },
      ],
    });

    expect(
      setSort(
        {
          resourceType: 'Patient',
          sortRules: [{ code: 'name', descending: false }],
        },
        'name'
      )
    ).toMatchObject({
      resourceType: 'Patient',
      sortRules: [
        {
          code: 'name',
          descending: false,
        },
      ],
    });

    expect(
      setSort(
        {
          resourceType: 'Patient',
          sortRules: [{ code: 'name', descending: true }],
        },
        'name'
      )
    ).toMatchObject({
      resourceType: 'Patient',
      sortRules: [
        {
          code: 'name',
          descending: false,
        },
      ],
    });

    expect(setSort({ resourceType: 'Patient' }, 'name', true)).toMatchObject({
      resourceType: 'Patient',
      sortRules: [
        {
          code: 'name',
          descending: true,
        },
      ],
    });

    expect(setSort({ resourceType: 'Patient', sortRules: [{ code: 'name' }] }, 'name', true)).toMatchObject({
      resourceType: 'Patient',
      sortRules: [
        {
          code: 'name',
          descending: true,
        },
      ],
    });

    expect(
      setSort(
        {
          resourceType: 'Patient',
          sortRules: [{ code: 'name', descending: false }],
        },
        'name',
        true
      )
    ).toMatchObject({
      resourceType: 'Patient',
      sortRules: [
        {
          code: 'name',
          descending: true,
        },
      ],
    });

    expect(
      setSort(
        {
          resourceType: 'Patient',
          sortRules: [{ code: 'name', descending: true }],
        },
        'name',
        true
      )
    ).toMatchObject({
      resourceType: 'Patient',
      sortRules: [
        {
          code: 'name',
          descending: true,
        },
      ],
    });
  });

  test('Toggle sort', () => {
    expect(toggleSort({ resourceType: 'Patient' }, 'name')).toMatchObject({
      resourceType: 'Patient',
      sortRules: [
        {
          code: 'name',
          descending: false,
        },
      ],
    });

    expect(toggleSort({ resourceType: 'Patient', sortRules: [{ code: 'name' }] }, 'name')).toMatchObject({
      resourceType: 'Patient',
      sortRules: [
        {
          code: 'name',
          descending: true,
        },
      ],
    });

    expect(
      toggleSort(
        {
          resourceType: 'Patient',
          sortRules: [{ code: 'name', descending: false }],
        },
        'name'
      )
    ).toMatchObject({
      resourceType: 'Patient',
      sortRules: [
        {
          code: 'name',
          descending: true,
        },
      ],
    });

    expect(
      toggleSort(
        {
          resourceType: 'Patient',
          sortRules: [{ code: 'name', descending: true }],
        },
        'name'
      )
    ).toMatchObject({
      resourceType: 'Patient',
      sortRules: [
        {
          code: 'name',
          descending: false,
        },
      ],
    });
  });

  test('Get sort field', () => {
    expect(getSortField({ resourceType: 'Patient' })).toBeUndefined();
    expect(getSortField({ resourceType: 'Patient', sortRules: [] })).toBeUndefined();
    expect(getSortField({ resourceType: 'Patient', sortRules: [{ code: 'name' }] })).toBe('name');
  });

  test('Is sort descending', () => {
    expect(isSortDescending({ resourceType: 'Patient' })).toBe(false);
    expect(isSortDescending({ resourceType: 'Patient', sortRules: [] })).toBe(false);
    expect(
      isSortDescending({
        resourceType: 'Patient',
        sortRules: [{ code: 'name' }],
      })
    ).toBe(false);
    expect(
      isSortDescending({
        resourceType: 'Patient',
        sortRules: [{ code: 'name', descending: true }],
      })
    ).toBe(true);
  });

  test('buildFieldName', () => {
    expect(buildFieldNameString(undefined, 'Patient', 'id')).toBe('ID');
    expect(buildFieldNameString(undefined, 'Patient', 'meta.versionId')).toBe('Version ID');
    expect(buildFieldNameString(undefined, 'Patient', '_lastUpdated')).toBe('Last Updated');
    expect(buildFieldNameString(undefined, 'Patient', 'name')).toBe('name');
    expect(buildFieldNameString({ types: {} }, 'Patient', 'name')).toBe('name');
    expect(buildFieldNameString({ types: { Patient: {} as TypeSchema } }, 'Patient', 'name')).toBe('name');
    expect(
      buildFieldNameString({ types: { Patient: { display: 'Patient', properties: {} } } }, 'Patient', 'name')
    ).toBe('name');
    expect(
      buildFieldNameString(
        { types: { Patient: { display: 'Patient', properties: { name: { path: 'Patient.name' } } } } },
        'Patient',
        'name'
      )
    ).toBe('Name');
  });
});

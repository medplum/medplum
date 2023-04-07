import { formatSearchQuery, Operator, parseSearchDefinition } from './search';

describe('Search Utils', () => {
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
});

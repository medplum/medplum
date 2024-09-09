import { getFieldDefinitions } from './SearchControlField';

describe('getFieldDefinitions', () => {
  test('prefix field names do not match in searchParam expressions', () => {
    const fieldDefs = getFieldDefinitions({
      resourceType: 'Patient',
      fields: ['id', 'identifier'],
    });

    expect(fieldDefs.length).toBe(2);
    const idField = fieldDefs.find((field) => field.name === 'id');
    const identifierField = fieldDefs.find((field) => field.name === 'identifier');

    expect(idField?.searchParams?.length).toBe(1);
    expect(idField?.searchParams?.find((sp) => sp.code === '_id')).toBeDefined();

    expect(identifierField?.searchParams?.length).toBe(1);
    expect(identifierField?.searchParams?.find((sp) => sp.code === 'identifier')).toBeDefined();
  });
});

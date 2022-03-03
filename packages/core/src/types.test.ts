import { indexSearchParameter, indexStructureDefinition } from '.';
import { createSchema, getPropertyDisplayName } from './types';

describe('Type Utils', () => {
  test('indexStructureDefinition', () => {
    const schema = createSchema();
    expect(schema.types).toBeDefined();

    // Silently ignore empty structure definitions
    indexStructureDefinition(schema, { resourceType: 'StructureDefinition' });

    // Silently ignore structure definitions without any elements
    indexStructureDefinition(schema, {
      resourceType: 'StructureDefinition',
      name: 'EmptyStructureDefinition',
      snapshot: {},
    });

    // Index a patient definition
    indexStructureDefinition(schema, {
      resourceType: 'StructureDefinition',
      id: '123',
      name: 'Patient',
      snapshot: {
        element: [
          {
            id: 'Patient.name',
            path: 'Patient.name',
            type: [
              {
                code: 'HumanName',
              },
            ],
            max: '*',
          },
        ],
      },
    });
    expect(schema.types['Patient']).toBeDefined();
    expect(schema.types['Patient'].properties).toBeDefined();
    expect(schema.types['Patient'].properties['name']).toBeDefined();

    // Silently ignore search parameters without base
    indexSearchParameter(schema, { resourceType: 'SearchParameter' });

    // Silently ignore search parameters for types without a StructureDefinition
    indexSearchParameter(schema, { resourceType: 'SearchParameter', base: ['XYZ'] });
    expect(schema.types['XYZ']).toBeUndefined();

    // Index a patient search parameter
    indexSearchParameter(schema, {
      resourceType: 'SearchParameter',
      id: 'Patient-name',
      base: ['Patient'],
      code: 'name',
      name: 'name',
      type: 'string',
      expression: 'Patient.name',
    });
    expect(schema.types['Patient'].searchParams?.['name']).toBeDefined();

    // Index again and silently ignore
    indexSearchParameter(schema, {
      resourceType: 'SearchParameter',
      id: 'Patient-name',
      base: ['Patient'],
      code: 'name',
      name: 'name',
      type: 'string',
      expression: 'Patient.name',
    });
    expect(schema.types['Patient'].searchParams?.['name']).toBeDefined();
  });

  test('getPropertyDisplayName', () => {
    expect(getPropertyDisplayName({ path: 'Patient.id' })).toEqual('ID');
    expect(getPropertyDisplayName({ path: 'Patient.name' })).toEqual('Name');
    expect(getPropertyDisplayName({ path: 'Patient.birthDate' })).toEqual('Birth Date');
    expect(getPropertyDisplayName({ path: 'DeviceDefinition.manufacturer[x]' })).toEqual('Manufacturer');
  });
});

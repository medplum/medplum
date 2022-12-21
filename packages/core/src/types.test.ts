import { ResourceType } from '@medplum/fhirtypes';
import {
  getElementDefinitionTypeName,
  getPropertyDisplayName,
  getResourceTypes,
  getResourceTypeSchema,
  getSearchParameters,
  globalSchema,
  indexSearchParameter,
  indexStructureDefinition,
  isResourceType,
  TypeSchema,
} from './types';

describe('Type Utils', () => {
  test('indexStructureDefinition', () => {
    // Silently ignore empty structure definitions
    indexStructureDefinition({ resourceType: 'StructureDefinition' });

    // Silently ignore structure definitions without any elements
    indexStructureDefinition({
      resourceType: 'StructureDefinition',
      name: 'EmptyStructureDefinition',
      snapshot: {},
    });

    // Index a patient definition
    indexStructureDefinition({
      resourceType: 'StructureDefinition',
      id: '123',
      name: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
      snapshot: {
        element: [
          {
            id: 'Patient',
            path: 'Patient',
          },
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
    expect(globalSchema.types['Patient']).toBeDefined();
    expect(globalSchema.types['Patient'].properties).toBeDefined();
    expect(globalSchema.types['Patient'].properties['name']).toBeDefined();
    expect(getResourceTypes()).toContain('Patient');
    expect(getResourceTypeSchema('Patient')).toBeDefined();

    // Silently ignore search parameters without base
    indexSearchParameter({ resourceType: 'SearchParameter' });

    // Silently ignore search parameters for types without a StructureDefinition
    indexSearchParameter({ resourceType: 'SearchParameter', base: ['XYZ' as ResourceType] });
    expect(globalSchema.types['XYZ']).toBeUndefined();

    // Index a patient search parameter
    indexSearchParameter({
      resourceType: 'SearchParameter',
      id: 'Patient-name',
      base: ['Patient'],
      code: 'name',
      name: 'name',
      type: 'string',
      expression: 'Patient.name',
    });
    expect(globalSchema.types['Patient'].searchParams?.['name']).toBeDefined();
    expect(getSearchParameters('Patient')).toBeDefined();

    // Expect base search parameters to be indexed
    expect(globalSchema.types['Patient'].searchParams?.['_id']).toBeDefined();
    expect(globalSchema.types['Patient'].searchParams?.['_lastUpdated']).toBeDefined();

    // Index again and silently ignore
    indexSearchParameter({
      resourceType: 'SearchParameter',
      id: 'Patient-name',
      base: ['Patient'],
      code: 'name',
      name: 'name',
      type: 'string',
      expression: 'Patient.name',
    });
    expect(globalSchema.types['Patient'].searchParams?.['name']).toBeDefined();
  });

  test('getPropertyDisplayName', () => {
    expect(getPropertyDisplayName('Patient.id')).toEqual('ID');
    expect(getPropertyDisplayName('Patient.name')).toEqual('Name');
    expect(getPropertyDisplayName('Patient.birthDate')).toEqual('Birth Date');
    expect(getPropertyDisplayName('DeviceDefinition.manufacturer[x]')).toEqual('Manufacturer');
    expect(getPropertyDisplayName('ClientApplication.jwksUri')).toEqual('JWKS URI');
    expect(getPropertyDisplayName('ClientApplication.redirectUri')).toEqual('Redirect URI');
  });

  test('getElementDefinitionTypeName', () => {
    expect(getElementDefinitionTypeName({ type: [{ code: 'string' }] })).toEqual('string');
    expect(getElementDefinitionTypeName({ path: 'Patient.address', type: [{ code: 'Address' }] })).toEqual('Address');
    expect(getElementDefinitionTypeName({ path: 'Patient.contact', type: [{ code: 'BackboneElement' }] })).toEqual(
      'PatientContact'
    );
    expect(getElementDefinitionTypeName({ path: 'Timing.repeat', type: [{ code: 'Element' }] })).toEqual(
      'TimingRepeat'
    );
  });

  test('isResourceType', () => {
    expect(
      isResourceType({
        structureDefinition: {
          baseDefinition: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
        },
      } as unknown as TypeSchema)
    ).toBeTruthy();

    expect(
      isResourceType({
        structureDefinition: {
          baseDefinition: 'http://example.com',
        },
      } as unknown as TypeSchema)
    ).not.toBeTruthy();
  });
});

import {
  Address,
  CodeableConcept,
  Coding,
  ContactPoint,
  Extension,
  HumanName,
  Identifier,
  Patient,
  Quantity,
  Reference,
  ResourceType,
} from '@medplum/fhirtypes';
import {
  stringifyTypedValue,
  getElementDefinitionTypeName,
  getPropertyDisplayName,
  getResourceTypes,
  getResourceTypeSchema,
  getSearchParameters,
  globalSchema,
  indexSearchParameter,
  indexStructureDefinition,
  isReference,
  isResource,
  isResourceTypeSchema,
  TypedValue,
  TypeSchema,
} from './types';
import { LOINC, UCUM } from './constants';

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
      kind: 'resource',
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

    // There is an important special case for ElementDefinition with contentReference
    // In the original StructureDefinition, contentReference is used to point to another ElementDefinition
    // In StructureDefinitionParser.peek(), we merge the referenced ElementDefinition into the current one
    // In that case, ElementDefinition.path will be the original, but ElementDefinition.base.path will be the referenced.
    expect(
      getElementDefinitionTypeName({
        path: 'Questionnaire.item.item',
        base: { path: 'Questionnaire.item' },
        type: [{ code: 'Element' }],
      })
    ).toEqual('QuestionnaireItem');
  });

  test('isResourceTypeSchema', () => {
    indexStructureDefinition({
      resourceType: 'StructureDefinition',
      id: '123',
      name: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
      kind: 'resource',
      snapshot: {
        element: [
          {
            id: 'Patient',
            path: 'Patient',
          },
          {
            id: 'Patient.name',
            path: 'Patient.name',
            type: [{ code: 'HumanName' }],
            max: '*',
          },
          {
            id: 'Patient.contact',
            path: 'Patient.contact',
            max: '*',
            type: [{ code: 'BackboneElement' }],
          },
          {
            id: 'Patient.contact.id',
            path: 'Patient.contact.id',
            type: [{ code: 'string' }],
          },
        ],
      },
    });

    expect(globalSchema.types['Patient']).toBeDefined();
    expect(isResourceTypeSchema(globalSchema.types['Patient'])).toBeTruthy();

    expect(globalSchema.types['PatientContact']).toBeDefined();
    expect(isResourceTypeSchema(globalSchema.types['PatientContact'])).toBeFalsy();

    expect(
      isResourceTypeSchema({
        structureDefinition: {
          name: 'XYZ',
          kind: 'resource',
          abstract: false,
        },
        elementDefinition: {
          path: 'XYZ',
        },
      } as unknown as TypeSchema)
    ).toBeTruthy();

    expect(
      isResourceTypeSchema({
        structureDefinition: {
          name: 'XYZ',
          kind: 'resource',
          abstract: true,
          snapshot: { element: [{ path: 'XYZ' }] },
        },
        elementDefinition: {
          path: 'XYZ',
        },
      } as unknown as TypeSchema)
    ).not.toBeTruthy();

    expect(
      isResourceTypeSchema({
        structureDefinition: {
          name: 'XYZ',
          kind: 'logical',
          abstract: false,
          snapshot: { element: [{ path: 'XYZ' }] },
        },
        elementDefinition: {
          path: 'XYZ',
        },
      } as unknown as TypeSchema)
    ).not.toBeTruthy();
  });

  test('isResource', () => {
    expect(isResource(undefined)).toBe(false);
    expect(isResource(null)).toBe(false);
    expect(isResource('Patient')).toBe(false);
    expect(isResource({})).toBe(false);
    expect(isResource({ resourceType: 'Patient' })).toBe(true);
    expect(isResource({ reference: 'Patient/123' })).toBe(false);
  });

  test('isReference', () => {
    expect(isReference(undefined)).toBe(false);
    expect(isReference(null)).toBe(false);
    expect(isReference('Patient')).toBe(false);
    expect(isReference({})).toBe(false);
    expect(isReference({ resourceType: 'Patient' })).toBe(false);
    expect(isReference({ reference: 'Patient/123' })).toBe(true);
  });

  test.each<[TypedValue, string]>([
    [{ type: 'string', value: 'foo' }, 'foo'],
    [{ type: 'date', value: '2020-01-01' }, '2020-01-01'],
    [{ type: 'Coding', value: { system: LOINC, code: '00000-0', display: 'unused' } as Coding }, `${LOINC}|00000-0`],
    [
      { type: 'Identifier', value: { system: 'urn:oid:2.16.840.1.113883.4.3.6', value: 'F9999999' } as Identifier },
      'urn:oid:2.16.840.1.113883.4.3.6|F9999999',
    ],
    [
      {
        type: 'CodeableConcept',
        value: {
          coding: [
            { system: LOINC, code: '00000-0' },
            { system: LOINC, code: '11111-1' },
          ],
        } as CodeableConcept,
      },
      `${LOINC}|00000-0,${LOINC}|11111-1`,
    ],
    [
      { type: 'HumanName', value: { text: 'Santa Claus', given: ['Kris'], family: 'Kringle' } as HumanName },
      'Santa Claus',
    ],
    [{ type: 'HumanName', value: { given: ['Kris'], family: 'Kringle' } as HumanName }, 'Kris Kringle'],
    [{ type: 'integer', value: 12345 }, '12345'],
    [{ type: 'positiveInt', value: 12345 }, '12345'],
    [{ type: 'decimal', value: 123.45 }, '123.45'],
    [{ type: 'boolean', value: true }, 'true'],
    [{ type: 'boolean', value: false }, 'false'],
    [{ type: 'ContactPoint', value: { value: '555-555-5555' } as ContactPoint }, '555-555-5555'],
    [
      { type: 'Extension', value: { url: 'http://example.com/ext1', valueString: 'unused' } as Extension },
      'http://example.com/ext1',
    ],
    [{ type: 'Reference', value: { reference: 'Patient/example' } as Reference }, 'Patient/example'],
    [{ type: 'Patient', value: { resourceType: 'Patient', id: 'example' } as Patient }, 'Patient/example'],
    [
      { type: 'Address', value: { country: 'US', state: 'CA' } as Address },
      `{"type":"Address","value":{"country":"US","state":"CA"}}`,
    ],
    [{ type: 'Quantity', value: { unit: 'mg', value: 100 } as Quantity }, '100||mg'],
    [{ type: 'Age', value: { code: 'a', system: UCUM, value: 34.9 } as Quantity }, `34.9|${UCUM}|a`],
  ])('formatTypedValue()', (value, expected) => {
    const actual = stringifyTypedValue(value);
    expect(actual).toEqual(expected);
  });
});

import {
  Address,
  CodeableConcept,
  Coding,
  ContactPoint,
  ElementDefinition,
  Extension,
  HumanName,
  Identifier,
  Patient,
  Quantity,
  Reference,
} from '@medplum/fhirtypes';
import { LOINC, UCUM } from './constants';
import {
  TypedValue,
  getElementDefinitionFromElements,
  getElementDefinitionTypeName,
  getPathDisplayName,
  getPropertyDisplayName,
  isReference,
  isResource,
  stringifyTypedValue,
} from './types';

describe('Type Utils', () => {
  test('getPathDisplayName', () => {
    expect(getPathDisplayName('Patient.id')).toEqual('ID');
    expect(getPathDisplayName('Patient.name')).toEqual('Name');
    expect(getPathDisplayName('Patient.birthDate')).toEqual('Birth Date');
    expect(getPathDisplayName('DeviceDefinition.manufacturer[x]')).toEqual('Manufacturer');
    expect(getPathDisplayName('ClientApplication.jwksUri')).toEqual('JWKS URI');
    expect(getPathDisplayName('ClientApplication.redirectUri')).toEqual('Redirect URI');
    expect(getPathDisplayName('Device.udiCarrier')).toEqual('UDI Carrier');
    expect(getPathDisplayName('Patient.withASingleCharacterWord')).toEqual('With A Single Character Word');
    expect(getPathDisplayName('Device.udiCarrier.carrierAIDC')).toEqual('Carrier AIDC');
    expect(getPathDisplayName('Device.udiCarrier.carrierHRF')).toEqual('Carrier HRF');
    expect(getPathDisplayName('Patient.digitAtEnd8')).toEqual('Digit At End 8');
    expect(getPathDisplayName('Patient.8digitAtStart')).toEqual('8 Digit At Start');
    expect(getPathDisplayName('Patient.digit8InMiddle')).toEqual('Digit 8 In Middle');
  });

  test('getPropertyDisplayName', () => {
    expect(getPropertyDisplayName('_lastUpdated')).toEqual('Last Updated');
  });

  test('getElementDefinitionTypeName', () => {
    expect(getElementDefinitionTypeName({ type: [{ code: 'string' }] } as ElementDefinition)).toEqual('string');
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
        base: { path: 'Questionnaire.item', min: 0, max: '*' },
        type: [{ code: 'Element' }],
      })
    ).toEqual('QuestionnaireItem');
  });

  test('getElementDefinitionFromElements', () => {
    const elements = {
      address: { path: 'Patient.address', type: [{ code: 'Address' }], description: '', min: 0, max: 1 },
      'value[x]': { path: 'Patient.value[x]', type: [{ code: 'string' }], description: '', min: 0, max: 1 },
    };

    // should be found
    expect(getElementDefinitionFromElements(elements, 'address')).toBeDefined();
    expect(getElementDefinitionFromElements(elements, 'value[x]')).toBeDefined();
    expect(getElementDefinitionFromElements(elements, 'value')).toBeDefined();

    expect(getElementDefinitionFromElements(elements, 'value')).toEqual(
      getElementDefinitionFromElements(elements, 'value[x]')
    );

    // shoudl NOT be found
    expect(getElementDefinitionFromElements(elements, 'notreal')).toBeUndefined();
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
    expect(isReference({ reference: { value: '123' } })).toBe(false);
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

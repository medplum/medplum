// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  Address,
  CodeableConcept,
  Coding,
  ContactPoint,
  ElementDefinition,
  Extension,
  HumanName,
  Identifier,
  Patient,
  Practitioner,
  Quantity,
  Reference,
  Resource,
  Task,
} from '@medplum/fhirtypes';
import { LOINC, UCUM } from './constants';
import type { Dereference, TypedValue } from './types';
import {
  getElementDefinitionFromElements,
  getElementDefinitionTypeName,
  getPathDisplayName,
  getPropertyDisplayName,
  isReference,
  isResource,
  isTypedValue,
  stringifyTypedValue,
} from './types';

describe('Type Utils', () => {
  test('getPathDisplayName', () => {
    expect(getPathDisplayName('Patient.id')).toStrictEqual('ID');
    expect(getPathDisplayName('Patient.name')).toStrictEqual('Name');
    expect(getPathDisplayName('Patient.birthDate')).toStrictEqual('Birth Date');
    expect(getPathDisplayName('DeviceDefinition.manufacturer[x]')).toStrictEqual('Manufacturer');
    expect(getPathDisplayName('ClientApplication.jwksUri')).toStrictEqual('JWKS URI');
    expect(getPathDisplayName('ClientApplication.redirectUri')).toStrictEqual('Redirect URI');
    expect(getPathDisplayName('Device.udiCarrier')).toStrictEqual('UDI Carrier');
    expect(getPathDisplayName('Patient.withASingleCharacterWord')).toStrictEqual('With A Single Character Word');
    expect(getPathDisplayName('Device.udiCarrier.carrierAIDC')).toStrictEqual('Carrier AIDC');
    expect(getPathDisplayName('Device.udiCarrier.carrierHRF')).toStrictEqual('Carrier HRF');
    expect(getPathDisplayName('Patient.digitAtEnd8')).toStrictEqual('Digit At End 8');
    expect(getPathDisplayName('Patient.8digitAtStart')).toStrictEqual('8 Digit At Start');
    expect(getPathDisplayName('Patient.digit8InMiddle')).toStrictEqual('Digit 8 In Middle');
  });

  test('getPropertyDisplayName', () => {
    expect(getPropertyDisplayName('_lastUpdated')).toStrictEqual('Last Updated');
  });

  test('getElementDefinitionTypeName', () => {
    expect(getElementDefinitionTypeName({ type: [{ code: 'string' }] } as ElementDefinition)).toStrictEqual('string');
    expect(getElementDefinitionTypeName({ path: 'Patient.address', type: [{ code: 'Address' }] })).toStrictEqual(
      'Address'
    );
    expect(
      getElementDefinitionTypeName({ path: 'Patient.contact', type: [{ code: 'BackboneElement' }] })
    ).toStrictEqual('PatientContact');
    expect(getElementDefinitionTypeName({ path: 'Timing.repeat', type: [{ code: 'Element' }] })).toStrictEqual(
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
    ).toStrictEqual('QuestionnaireItem');
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

    expect(getElementDefinitionFromElements(elements, 'value')).toStrictEqual(
      getElementDefinitionFromElements(elements, 'value[x]')
    );

    // shoudl NOT be found
    expect(getElementDefinitionFromElements(elements, 'notreal')).toBeUndefined();
  });

  test('isTypedValue', () => {
    expect(isTypedValue(undefined)).toBe(false);
    expect(isTypedValue(null)).toBe(false);
    expect(isTypedValue('Patient')).toBe(false);
    expect(isTypedValue({})).toBe(false);
    expect(isTypedValue({ type: 'string', value: 'foo' })).toBe(true);
    expect(isTypedValue({ type: 'string' })).toBe(false);
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
    // Basic reference validation (no resourceType parameter)
    expect(isReference(undefined)).toBe(false);
    expect(isReference(null)).toBe(false);
    expect(isReference('Patient')).toBe(false);
    expect(isReference({})).toBe(false);
    expect(isReference({ resourceType: 'Patient' })).toBe(false);
    expect(isReference({ reference: 'Patient/123' })).toBe(true);
    expect(isReference({ reference: { value: '123' } })).toBe(false);

    // Test with resourceType parameter - matching cases
    expect(isReference({ reference: 'Patient/123' }, 'Patient')).toBe(true);
    expect(isReference({ reference: 'Observation/456' }, 'Observation')).toBe(true);
    expect(isReference({ reference: 'Organization/789' }, 'Organization')).toBe(true);
    expect(isReference({ reference: 'Practitioner/abc' }, 'Practitioner')).toBe(true);

    // Test with resourceType parameter - non-matching cases
    expect(isReference({ reference: 'Patient/123' }, 'Observation')).toBe(false);
    expect(isReference({ reference: 'Observation/456' }, 'Patient')).toBe(false);
    expect(isReference({ reference: 'AppointmentResponse/789' }, 'Appointment')).toBe(false);

    // Test with resourceType parameter - edge cases
    expect(isReference({ reference: 'Patient' }, 'Patient')).toBe(false); // no ID or query parameters
    expect(isReference({ reference: 'Patient?name=John' }, 'Patient')).toBe(true); // query parameters
    expect(isReference({ reference: 'Patient/123?version=1' }, 'Patient')).toBe(true); // ID with query

    // Test case sensitivity
    expect(isReference({ reference: 'patient/123' }, 'Patient')).toBe(false);

    // Test partial matches (should not match)
    expect(isReference({ reference: 'MyPatient/123' }, 'Patient')).toBe(false);
    expect(isReference({ reference: 'PatientData/123' }, 'Patient')).toBe(false);

    // Test invalid reference values with resourceType
    expect(isReference(undefined, 'Patient')).toBe(false);
    expect(isReference(null, 'Patient')).toBe(false);
    expect(isReference({}, 'Patient')).toBe(false);
    expect(isReference({ reference: { value: '123' } }, 'Patient')).toBe(false);

    // Test empty and malformed references
    expect(isReference({ reference: '' }, 'Patient')).toBe(false);
    expect(isReference({ reference: '/' }, 'Patient')).toBe(false);
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
    expect(actual).toStrictEqual(expected);
  });

  // `Dereference` is a type-only utility, so these assertions are enforced by `tsc`
  // at build time rather than by Vitest at runtime.
  describe('Dereference', () => {
    test('extracts the target of a Reference', () => {
      expectTypeOf<Dereference<Reference<Patient>>>().toEqualTypeOf<Patient>();
    });

    test('preserves a multi-target Reference as a union', () => {
      expectTypeOf<Dereference<Reference<Patient | Practitioner>>>().toEqualTypeOf<Patient | Practitioner>();
    });

    test('distributes over a union of References', () => {
      expectTypeOf<Dereference<Reference<Patient> | Reference<Practitioner>>>().toEqualTypeOf<Patient | Practitioner>();
    });

    test('preserves null and undefined from an optional Reference', () => {
      expectTypeOf<Dereference<Reference<Patient> | undefined>>().toEqualTypeOf<Patient | undefined>();
      expectTypeOf<Dereference<Reference<Patient> | null>>().toEqualTypeOf<Patient | null>();
      // An optional FHIR reference field carries its optionality through
      expectTypeOf<Extract<Dereference<Task['owner']>, undefined>>().toEqualTypeOf<undefined>();
    });

    test('falls back to Resource for an unparameterized Reference', () => {
      expectTypeOf<Dereference<Reference>>().toEqualTypeOf<Resource>();
    });

    test('rejects input that is not a Reference', () => {
      // @ts-expect-error a resource is not a reference to one
      expectTypeOf<Dereference<Patient>>().toEqualTypeOf<Patient>();
      // @ts-expect-error a string is not a reference
      expectTypeOf<Dereference<string>>().toEqualTypeOf<string>();
      // @ts-expect-error an array of references has to be indexed first
      expectTypeOf<Dereference<Reference<Patient>[]>>().toBeArray();
      // @ts-expect-error the target of a reference is not itself a reference
      expectTypeOf<Dereference<Dereference<Reference<Patient>>>>().toEqualTypeOf<Patient>();
    });

    test('resolves an empty union to never', () => {
      expectTypeOf<Dereference<never>>().toBeNever();
    });

    test('accepts anything shaped like a Reference', () => {
      // Every field on `Reference` is optional, including the `resource?: T` that `R` is
      // inferred from, so a structurally compatible object satisfies the constraint and
      // then matches with no candidate for `R`, falling back to the default `Resource`.
      //
      // In the future it would be nice to find a way to make this stricter; for now this
      // documents the existing behavior.
      expectTypeOf<Dereference<Record<string, never>>>().toEqualTypeOf<Resource>();
    });
  });
});

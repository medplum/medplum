// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { readJson } from '@medplum/definitions';
import type { Bundle, Patient } from '@medplum/fhirtypes';
import type { TypedValue } from '../types';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { fhirpathPatchTypedValue } from './patch';
import { toTypedValue } from './utils';

describe('FHIRPath Patch', () => {
  let patient: Patient;
  let value: TypedValue;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  beforeEach(() => {
    patient = {
      resourceType: 'Patient',
      name: [
        {
          given: ['Jimmy'],
          family: 'Buckets',
          text: 'James H. Buckets, III',
        },
        {
          given: ['James', 'Horatio'],
          family: 'Buckington',
          suffix: ['III'],
        },
      ],
      active: true,
    };
    value = toTypedValue(patient);
  });

  describe('FHIRPath Patch', () => {
    test('Delete top level field', () => {
      fhirpathPatchTypedValue(value, [{ type: 'delete', path: 'active' }]);
      expect(patient.active).toBeUndefined();
    });

    test('Delete nested field', () => {
      fhirpathPatchTypedValue(value, [{ type: 'delete', path: 'name[0].text' }]);
      expect(patient.name?.[0]).toStrictEqual({
        given: ['Jimmy'],
        family: 'Buckets',
      });
    });

    test('Delete array element', () => {
      fhirpathPatchTypedValue(value, [{ type: 'delete', path: 'name[0]' }]);
      // Deleting first array element should shift the other element left
      expect(patient.name?.[0]).toStrictEqual({
        given: ['James', 'Horatio'],
        family: 'Buckington',
        suffix: ['III'],
      });
    });

    test('No-op on delete of missing value', () => {
      fhirpathPatchTypedValue(value, [{ type: 'delete', path: 'name[19].text' }]);
      expect(patient.name?.[0]?.text).toStrictEqual('James H. Buckets, III');
    });

    test('Error on delete with multiple results for path', () => {
      expect(() => fhirpathPatchTypedValue(value, [{ type: 'delete', path: 'name.given' }])).toThrow('multiple');
    });

    test('Error on delete with non-path expression', () => {
      expect(() => fhirpathPatchTypedValue(value, [{ type: 'delete', path: 'name = 1' }])).toThrow(
        'Cannot resolve pointer'
      );
    });

    test('Replace existing value', () => {
      fhirpathPatchTypedValue(value, [
        { type: 'replace', path: 'name[0].text', value: { type: 'string', value: 'Jimmy Buckets' } },
      ]);
      expect(patient.name?.[0]).toStrictEqual({
        given: ['Jimmy'],
        family: 'Buckets',
        text: 'Jimmy Buckets',
      });
    });

    test('Error on replace of missing value', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [
          { type: 'replace', path: 'name[19].text', value: { type: 'string', value: 'Jimmy Buckets' } },
        ])
      ).toThrow('Failed to resolve target value');
    });

    test('Error on replace with multiple results for path', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [
          { type: 'replace', path: 'name.given', value: { type: 'string', value: 'Horatio' } },
        ])
      ).toThrow('multiple');
    });

    test('Error on replace with non-path expression', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [
          { type: 'replace', path: 'name = 1', value: { type: 'boolean', value: false } },
        ])
      ).toThrow('Cannot resolve pointer');
    });

    test('Error on replace with non-path expression', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [
          { type: 'replace', path: 'name = 1', value: { type: 'boolean', value: false } },
        ])
      ).toThrow('Cannot resolve pointer');
    });

    test('Add top level missing element', () => {
      fhirpathPatchTypedValue(value, [
        { type: 'add', path: 'Patient', name: 'gender', value: { type: 'code', value: 'unknown' } },
      ]);
      expect(patient.gender).toStrictEqual('unknown');
    });

    test('Add top level present element', () => {
      // NOTE: This is slightly non-standard behavior, but is permitted to allow construction of patches
      // without needing to know the underlying state of the field (i.e. if a value is already present)
      fhirpathPatchTypedValue(value, [
        { type: 'add', path: 'Patient', name: 'active', value: { type: 'boolean', value: false } },
      ]);
      expect(patient.active).toStrictEqual(false);
    });

    test('Add element to existing array', () => {
      fhirpathPatchTypedValue(value, [
        { type: 'add', path: 'Patient.name[0]', name: 'given', value: { type: 'string', value: 'Horatio' } },
      ]);
      expect(patient.name?.[0].given).toStrictEqual(['Jimmy', 'Horatio']);
    });

    test('Add element to missing array', () => {
      fhirpathPatchTypedValue(value, [
        { type: 'add', path: 'Patient.name[0]', name: 'prefix', value: { type: 'string', value: 'Mssr.' } },
      ]);
      expect(patient.name?.[0].prefix).toStrictEqual(['Mssr.']);
    });

    test('Error on add to non-object', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [
          { type: 'add', path: 'Patient.name[0].family', name: '0', value: { type: 'string', value: 'R' } },
        ])
      ).toThrow('Failed to resolve base object');
    });

    test('Insert into array', () => {
      fhirpathPatchTypedValue(value, [
        { type: 'insert', path: 'Patient.name[0].given', index: 1, value: { type: 'string', value: 'Horatio' } },
      ]);
      expect(patient.name?.[0].given).toStrictEqual(['Jimmy', 'Horatio']);
    });

    test('Error on insert into missing field', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [
          { type: 'insert', path: 'Patient.name[0].prefix', index: 0, value: { type: 'string', value: 'Mr.' } },
        ])
      ).toThrow('Failed to resolve base');
    });

    test('Error on insert into non-array field', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [
          { type: 'insert', path: 'Patient.name[0]', index: 2, value: { type: 'string', value: '???' } },
        ])
      ).toThrow('Failed to resolve base');
    });

    test('Insert at valid computed path', () => {
      fhirpathPatchTypedValue(value, [
        {
          type: 'insert',
          path: `Patient.name.where(family = 'Buckington').given`,
          index: 1,
          value: { type: 'string', value: '(Jimmy)' },
        },
      ]);
      expect(patient.name?.[1].given).toStrictEqual(['James', '(Jimmy)', 'Horatio']);
    });

    test('Error on insert into non-contiguous collection', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [
          { type: 'insert', path: 'Patient.name.given', index: 0, value: { type: 'string', value: 'James' } },
        ])
      ).toThrow('Cannot patch heterogeneous collection');
    });

    test('Error on insert into incomplete collection', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [
          {
            type: 'insert',
            path: `Patient.name[1].given.where($this = 'Horatio')`,
            index: 0,
            value: { type: 'string', value: 'James' },
          },
        ])
      ).toThrow('Failed to resolve base collection');
    });

    test('Error on insert at index past end of array', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [
          {
            type: 'insert',
            path: `Patient.name[1].given`,
            index: 27,
            value: { type: 'string', value: '???' },
          },
        ])
      ).toThrow('Index out of bounds for insert');
    });

    test('Move within array', () => {
      fhirpathPatchTypedValue(value, [{ type: 'move', path: 'Patient.name[1].given', source: 0, destination: 1 }]);
      expect(patient.name?.[1].given).toStrictEqual(['Horatio', 'James']);
    });

    test('Error on move into missing field', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [{ type: 'move', path: 'Patient.name[0].prefix', source: 0, destination: 1 }])
      ).toThrow('Failed to resolve base');
    });

    test('Error on move into non-array field', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [{ type: 'move', path: 'Patient.name[0]', source: 2, destination: 5 }])
      ).toThrow('Failed to resolve base');
    });

    test('Move at valid computed path', () => {
      fhirpathPatchTypedValue(value, [
        {
          type: 'move',
          path: `Patient.name.where(family = 'Buckington').given`,
          source: 0,
          destination: 1,
        },
      ]);
      expect(patient.name?.[1].given).toStrictEqual(['Horatio', 'James']);
    });

    test('Error on move into non-contiguous collection', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [{ type: 'move', path: 'Patient.name.given', source: 0, destination: 1 }])
      ).toThrow('Cannot patch heterogeneous collection');
    });

    test('Error on move into incomplete collection', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [
          {
            type: 'move',
            path: `Patient.name[1].given.where($this = 'Horatio')`,
            source: 0,
            destination: 1,
          },
        ])
      ).toThrow('Failed to resolve base collection');
    });

    test('Error on move to index past end of array', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [
          {
            type: 'move',
            path: `Patient.name[1].given`,
            source: 0,
            destination: 27,
          },
        ])
      ).toThrow('Destination index out of bounds for move');
    });

    test('Error on move from negative index', () => {
      expect(() =>
        fhirpathPatchTypedValue(value, [
          {
            type: 'move',
            path: `Patient.name[1].given`,
            source: -1,
            destination: 0,
          },
        ])
      ).toThrow('Source index out of bounds for move');
    });
  });
});

import { CodeableConcept, Coding, ContactPoint, Identifier } from '@medplum/fhirtypes';
import { toTypedValue } from '../fhirpath/utils';
import {
  convertToDateSearchIR,
  convertToNumberSearchIR,
  convertToQuantitySearchIR,
  convertToReferenceSearchIR,
  convertToStringSearchIR,
  convertToTokenSearchIR,
  convertToUriSearchIR,
} from './ir';

describe('Search IR', () => {
  test('convertToNumberSearchIR', () => {
    expect(convertToNumberSearchIR([])).toStrictEqual([]);
    expect(convertToNumberSearchIR([{ type: 'undefined', value: undefined }])).toStrictEqual([]);
    expect(convertToNumberSearchIR([toTypedValue('foo')])).toStrictEqual([]);
    expect(convertToNumberSearchIR([toTypedValue(42)])).toStrictEqual([42]);
  });

  test('convertToDateSearchIR', () => {
    expect(convertToDateSearchIR([])).toStrictEqual([]);
    expect(convertToDateSearchIR([{ type: 'undefined', value: undefined }])).toStrictEqual([]);
    expect(convertToDateSearchIR([toTypedValue('foo')])).toStrictEqual([]);
    expect(convertToDateSearchIR([{ type: 'date', value: '2020-01-01' }])).toStrictEqual([
      { start: '2020-01-01T00:00:00.000Z', end: '2020-01-01T23:59:59.999Z' },
    ]);
  });

  test('convertToStringSearchIR', () => {
    expect(convertToStringSearchIR([])).toStrictEqual([]);
    expect(convertToStringSearchIR([{ type: 'undefined', value: undefined }])).toStrictEqual([]);
    expect(convertToStringSearchIR([toTypedValue('foo')])).toStrictEqual(['foo']);
    expect(convertToStringSearchIR([toTypedValue(42)])).toStrictEqual(['42']);
  });

  test('convertToReferenceSearchIR', () => {
    expect(convertToReferenceSearchIR([])).toStrictEqual([]);
    expect(convertToReferenceSearchIR([{ type: 'undefined', value: undefined }])).toStrictEqual([]);
    expect(convertToReferenceSearchIR([toTypedValue(42)])).toStrictEqual([]);

    // canonical string
    expect(convertToReferenceSearchIR([{ type: 'canonical', value: 'foo' }])).toStrictEqual(['foo']);

    // normal reference
    expect(convertToReferenceSearchIR([{ type: 'Reference', value: { reference: 'Patient/123' } }])).toStrictEqual([
      'Patient/123',
    ]);

    // inline resource
    expect(
      convertToReferenceSearchIR([{ type: 'Patient', value: { resourceType: 'Patient', id: '456' } }])
    ).toStrictEqual(['Patient/456']);

    // identifier
    expect(
      convertToReferenceSearchIR([
        { type: 'Reference', value: { identifier: { system: 'https://example.com', value: '789' } } },
      ])
    ).toStrictEqual(['identifier:https://example.com|789']);
  });

  test('convertToQuantitySearchIR', () => {
    expect(convertToQuantitySearchIR([])).toStrictEqual([]);
    expect(convertToQuantitySearchIR([{ type: 'undefined', value: undefined }])).toStrictEqual([]);
    expect(convertToQuantitySearchIR([toTypedValue(42)])).toStrictEqual([
      { value: 42, unit: '', system: '', code: '' },
    ]);
    expect(convertToQuantitySearchIR([{ type: 'Quantity', value: { value: 56, unit: 'kg' } }])).toStrictEqual([
      { value: 56, unit: 'kg' },
    ]);
  });

  test('convertToUriSearchIR', () => {
    expect(convertToUriSearchIR([])).toStrictEqual([]);
    expect(convertToUriSearchIR([{ type: 'undefined', value: undefined }])).toStrictEqual([]);
    expect(convertToUriSearchIR([toTypedValue(42)])).toStrictEqual([]);
    expect(convertToUriSearchIR([toTypedValue('foo')])).toStrictEqual(['foo']);
  });

  test('convertToTokenSearchIR', () => {
    expect(convertToTokenSearchIR([])).toStrictEqual([]);
    expect(convertToTokenSearchIR([{ type: 'undefined', value: undefined }])).toStrictEqual([]);

    // string
    expect(convertToTokenSearchIR([toTypedValue('foo')])).toStrictEqual([{ system: undefined, value: 'foo' }]);
    expect(
      convertToTokenSearchIR([toTypedValue('foo'), toTypedValue('foo'), toTypedValue('foo'), toTypedValue('foo')])
    ).toStrictEqual([{ system: undefined, value: 'foo' }]);
    expect(convertToTokenSearchIR([toTypedValue(42)])).toStrictEqual([{ system: undefined, value: '42' }]);

    // Identifier
    expect(
      convertToTokenSearchIR([
        { type: 'Identifier', value: { system: 'https://example.com', value: '789' } satisfies Identifier },
      ])
    ).toStrictEqual([{ system: 'https://example.com', value: '789' }]);

    // Identifier type text
    expect(
      convertToTokenSearchIR([
        {
          type: 'Identifier',
          value: { system: 'https://example.com', value: '789', type: { text: 'foo' } } satisfies Identifier,
        },
      ])
    ).toStrictEqual([
      { system: undefined, value: 'foo' },
      { system: 'https://example.com', value: '789' },
    ]);

    // CodeableConcept
    expect(
      convertToTokenSearchIR([
        {
          type: 'CodeableConcept',
          value: { coding: [{ system: 'https://example.com', code: '789' }] } satisfies CodeableConcept,
        },
      ])
    ).toStrictEqual([{ system: 'https://example.com', value: '789' }]);

    // CodeableConcept with text
    expect(
      convertToTokenSearchIR([
        {
          type: 'CodeableConcept',
          value: { coding: [{ system: 'https://example.com', code: '789' }], text: 'foo' } satisfies CodeableConcept,
        },
      ])
    ).toStrictEqual([
      { system: undefined, value: 'foo' },
      { system: 'https://example.com', value: '789' },
    ]);

    // CodeableConcept only text
    expect(
      convertToTokenSearchIR([
        {
          type: 'CodeableConcept',
          value: { text: 'foo' } satisfies CodeableConcept,
        },
      ])
    ).toStrictEqual([{ system: undefined, value: 'foo' }]);

    // Coding
    expect(
      convertToTokenSearchIR([
        { type: 'Coding', value: { system: 'https://example.com', code: '789' } satisfies Coding },
      ])
    ).toStrictEqual([{ system: 'https://example.com', value: '789' }]);

    // Coding with display
    expect(
      convertToTokenSearchIR([
        { type: 'Coding', value: { system: 'https://example.com', code: '789', display: 'foo' } satisfies Coding },
      ])
    ).toStrictEqual([
      { system: undefined, value: 'foo' },
      { system: 'https://example.com', value: '789' },
    ]);

    // ContactPoint
    expect(
      convertToTokenSearchIR([
        { type: 'ContactPoint', value: { system: 'phone', value: '789' } satisfies ContactPoint },
      ])
    ).toStrictEqual([{ system: 'phone', value: '789' }]);
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CodeableConcept, Coding, ContactPoint, Identifier } from '@medplum/fhirtypes';
import { toTypedValue } from '../fhirpath/utils';
import {
  convertToSearchableDates,
  convertToSearchableNumbers,
  convertToSearchableQuantities,
  convertToSearchableReferences,
  convertToSearchableStrings,
  convertToSearchableTokens,
  convertToSearchableUris,
} from './ir';

describe('Search IR', () => {
  test('convertToSearchableNumbers', () => {
    expect(convertToSearchableNumbers([])).toStrictEqual([]);
    expect(convertToSearchableNumbers([{ type: 'undefined', value: undefined }])).toStrictEqual([]);
    expect(
      convertToSearchableNumbers([{ type: 'Range', value: { low: { value: 10 }, high: { value: 20 } } }])
    ).toStrictEqual([[10, 20]]);
    expect(convertToSearchableNumbers([toTypedValue('foo')])).toStrictEqual([]);
    expect(convertToSearchableNumbers([toTypedValue(42)])).toStrictEqual([[42, 42]]);
  });

  test('convertToSearchableDates', () => {
    expect(convertToSearchableDates([])).toStrictEqual([]);
    expect(convertToSearchableDates([{ type: 'undefined', value: undefined }])).toStrictEqual([]);
    expect(convertToSearchableDates([toTypedValue('foo')])).toStrictEqual([]);
    expect(convertToSearchableDates([{ type: 'date', value: '2020-01-01' }])).toStrictEqual([
      { start: '2020-01-01T00:00:00.000Z', end: '2020-01-01T23:59:59.999Z' },
    ]);
  });

  test('convertToSearchableStrings', () => {
    expect(convertToSearchableStrings([])).toStrictEqual([]);
    expect(convertToSearchableStrings([{ type: 'undefined', value: undefined }])).toStrictEqual([]);
    expect(convertToSearchableStrings([toTypedValue('foo')])).toStrictEqual(['foo']);
    expect(convertToSearchableStrings([toTypedValue(42)])).toStrictEqual(['42']);
  });

  test('convertToSearchableReferences', () => {
    expect(convertToSearchableReferences([])).toStrictEqual([]);
    expect(convertToSearchableReferences([{ type: 'undefined', value: undefined }])).toStrictEqual([]);
    expect(convertToSearchableReferences([toTypedValue(42)])).toStrictEqual([]);

    // canonical string
    expect(convertToSearchableReferences([{ type: 'canonical', value: 'foo' }])).toStrictEqual(['foo']);

    // normal reference
    expect(convertToSearchableReferences([{ type: 'Reference', value: { reference: 'Patient/123' } }])).toStrictEqual([
      'Patient/123',
    ]);

    // inline resource
    expect(
      convertToSearchableReferences([{ type: 'Patient', value: { resourceType: 'Patient', id: '456' } }])
    ).toStrictEqual(['Patient/456']);

    // identifier
    expect(
      convertToSearchableReferences([
        { type: 'Reference', value: { identifier: { system: 'https://example.com', value: '789' } } },
      ])
    ).toStrictEqual(['identifier:https://example.com|789']);
  });

  test('convertToSearchableQuantities', () => {
    expect(convertToSearchableQuantities([])).toStrictEqual([]);
    expect(convertToSearchableQuantities([{ type: 'undefined', value: undefined }])).toStrictEqual([]);
    expect(convertToSearchableQuantities([toTypedValue(42)])).toStrictEqual([{ value: 42 }]);
    expect(convertToSearchableQuantities([{ type: 'Quantity', value: { value: 56, unit: 'kg' } }])).toStrictEqual([
      { value: 56, unit: 'kg' },
    ]);
  });

  test('convertToSearchableUris', () => {
    expect(convertToSearchableUris([])).toStrictEqual([]);
    expect(convertToSearchableUris([{ type: 'undefined', value: undefined }])).toStrictEqual([]);
    expect(convertToSearchableUris([toTypedValue(42)])).toStrictEqual([]);
    expect(convertToSearchableUris([toTypedValue('foo')])).toStrictEqual(['foo']);
  });

  test('convertToSearchableTokens', () => {
    expect(convertToSearchableTokens([])).toStrictEqual([]);
    expect(convertToSearchableTokens([{ type: 'undefined', value: undefined }])).toStrictEqual([]);

    // string
    expect(convertToSearchableTokens([toTypedValue('foo')])).toStrictEqual([{ system: undefined, value: 'foo' }]);
    expect(
      convertToSearchableTokens([toTypedValue('foo'), toTypedValue('foo'), toTypedValue('foo'), toTypedValue('foo')])
    ).toStrictEqual([{ system: undefined, value: 'foo' }]);
    expect(convertToSearchableTokens([toTypedValue(42)])).toStrictEqual([{ system: undefined, value: '42' }]);

    // Identifier
    expect(
      convertToSearchableTokens([
        { type: 'Identifier', value: { system: 'https://example.com', value: '789' } satisfies Identifier },
      ])
    ).toStrictEqual([{ system: 'https://example.com', value: '789' }]);

    // Identifier type text
    expect(
      convertToSearchableTokens([
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
      convertToSearchableTokens([
        {
          type: 'CodeableConcept',
          value: { coding: [{ system: 'https://example.com', code: '789' }] } satisfies CodeableConcept,
        },
      ])
    ).toStrictEqual([{ system: 'https://example.com', value: '789' }]);

    // CodeableConcept with text
    expect(
      convertToSearchableTokens([
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
      convertToSearchableTokens([
        {
          type: 'CodeableConcept',
          value: { text: 'foo' } satisfies CodeableConcept,
        },
      ])
    ).toStrictEqual([{ system: undefined, value: 'foo' }]);

    // CodeableConcept empty
    expect(
      convertToSearchableTokens([
        {
          type: 'CodeableConcept',
          value: {} satisfies CodeableConcept,
        },
      ])
    ).toStrictEqual([]);

    // Coding
    expect(
      convertToSearchableTokens([
        { type: 'Coding', value: { system: 'https://example.com', code: '789' } satisfies Coding },
      ])
    ).toStrictEqual([{ system: 'https://example.com', value: '789' }]);

    // Coding with display
    expect(
      convertToSearchableTokens([
        { type: 'Coding', value: { system: 'https://example.com', code: '789', display: 'foo' } satisfies Coding },
      ])
    ).toStrictEqual([
      { system: undefined, value: 'foo' },
      { system: 'https://example.com', value: '789' },
    ]);

    // ContactPoint
    expect(
      convertToSearchableTokens([
        { type: 'ContactPoint', value: { system: 'phone', value: '789' } satisfies ContactPoint },
      ])
    ).toStrictEqual([{ system: 'phone', value: '789' }]);
  });
});

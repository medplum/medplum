// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { toTypedValue } from '../fhirpath/utils';
import {
  clearValueSets,
  indexValueSets,
  isValueSetLoaded,
  loadValueSet,
  typedValueInValueSet,
} from './valuesets';

describe('ValueSet registry', () => {
  afterEach(() => {
    clearValueSets();
  });

  test('loadValueSet indexes extensional compose concepts', () => {
    loadValueSet({
      resourceType: 'ValueSet',
      url: 'http://example.org/ValueSet/colors',
      status: 'active',
      compose: {
        include: [
          {
            system: 'http://example.org/CodeSystem/colors',
            concept: [{ code: 'red' }, { code: 'blue' }],
          },
        ],
      },
    });

    expect(isValueSetLoaded('http://example.org/ValueSet/colors')).toBe(true);
    expect(
      typedValueInValueSet(
        { type: 'Coding', value: { system: 'http://example.org/CodeSystem/colors', code: 'red' } },
        'http://example.org/ValueSet/colors'
      )
    ).toBe(true);
    expect(
      typedValueInValueSet(
        { type: 'Coding', value: { system: 'http://example.org/CodeSystem/colors', code: 'green' } },
        'http://example.org/ValueSet/colors'
      )
    ).toBe(false);
  });

  test('CodeableConcept matches if any coding is in the set', () => {
    loadValueSet({
      resourceType: 'ValueSet',
      url: 'http://example.org/ValueSet/colors',
      status: 'active',
      compose: {
        include: [
          {
            system: 'http://example.org/CodeSystem/colors',
            concept: [{ code: 'red' }],
          },
        ],
      },
    });

    expect(
      typedValueInValueSet(
        {
          type: 'CodeableConcept',
          value: {
            coding: [
              { system: 'http://example.org/CodeSystem/other', code: 'x' },
              { system: 'http://example.org/CodeSystem/colors', code: 'red' },
            ],
          },
        },
        'http://example.org/ValueSet/colors'
      )
    ).toBe(true);
  });

  test('returns undefined when ValueSet is not loaded', () => {
    expect(typedValueInValueSet(toTypedValue('red'), 'http://example.org/ValueSet/missing')).toBeUndefined();
  });

  test('returns undefined for non-extensional includes', () => {
    loadValueSet({
      resourceType: 'ValueSet',
      url: 'http://example.org/ValueSet/all-colors',
      status: 'active',
      compose: {
        include: [{ system: 'http://example.org/CodeSystem/colors' }],
      },
    });
    expect(isValueSetLoaded('http://example.org/ValueSet/all-colors')).toBe(true);
    expect(typedValueInValueSet(toTypedValue('red'), 'http://example.org/ValueSet/all-colors')).toBeUndefined();
  });

  test('indexValueSets loads multiple', () => {
    indexValueSets([
      {
        resourceType: 'ValueSet',
        url: 'http://example.org/ValueSet/a',
        status: 'active',
        expansion: { timestamp: '2020-01-01', contains: [{ system: 's', code: 'a' }] },
      },
      {
        resourceType: 'ValueSet',
        url: 'http://example.org/ValueSet/b|1.0.0',
        status: 'active',
        expansion: { timestamp: '2020-01-01', contains: [{ system: 's', code: 'b' }] },
      },
    ]);
    expect(isValueSetLoaded('http://example.org/ValueSet/a')).toBe(true);
    expect(isValueSetLoaded('http://example.org/ValueSet/b')).toBe(true);
    expect(isValueSetLoaded('http://example.org/ValueSet/b|1.0.0')).toBe(true);
  });
});

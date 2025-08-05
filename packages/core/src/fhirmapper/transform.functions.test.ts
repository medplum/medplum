// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { toTypedValue } from '../fhirpath/utils';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { parseMappingLanguage } from './parse';
import { structureMapTransform } from './transform';

describe('FHIR Mapper transform functions', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('cast to string', () => {
    const map = `map "https://example.com" = test
    group example(source src, target tgt) {
      src.value as v -> tgt.value = cast(v, 'string');
    }`;

    const input = [toTypedValue({ value: 123 })];
    const expected = [toTypedValue({ value: '123' })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toStrictEqual(expected);
  });

  test('cc with text', () => {
    const map = `map "https://example.com" = test
    group example(source src, target tgt) {
      src.value as v -> tgt.value = cc(v);
    }`;

    const input = [toTypedValue({ value: 'foo' })];
    const expected = [toTypedValue({ value: { text: 'foo' } })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });

  test('cc with system', () => {
    const map = `map "https://example.com" = test
    group example(source src, target tgt) {
      src.value as v -> tgt.value = cc('https://example.com', v);
    }`;

    const input = [toTypedValue({ value: 'foo' })];
    const expected = [toTypedValue({ value: { coding: [{ system: 'https://example.com', code: 'foo' }] } })];
    const actual = structureMapTransform(parseMappingLanguage(map), input);
    expect(actual).toMatchObject(expected);
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { toTypedValue } from '../fhirpath/utils';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { parseMappingLanguage } from './parse';
import { structureMapTransform, TransformMapCollection } from './transform';

// Based on: https://github.com/Vermonster/fhir-kit-mapping-language/blob/master/test/engine/import.test.js
// MIT License

describe('FHIR Mapper transform - import', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('importing single known map', () => {
    const map1 = parseMappingLanguage(`map "http://test.com/1" = test

    imports "http://test.com/2"

    group example1(source src, target tgt) {
      src.name as sn -> tgt.name as tn then example2(sn, tn);
    }`);

    const map2 = parseMappingLanguage(`map "http://test.com/2" = test
    group example2(source src, target tgt) {
      src.firstName as ss -> tgt.firstName = ss;
    }`);

    const maps = new TransformMapCollection([map1, map2]);

    const input = [toTypedValue({ name: { firstName: 'Bob' } })];
    const actual = structureMapTransform(map1, input, maps);
    const expected = input;
    expect(actual).toMatchObject(expected);
  });

  test('importing using wildcard', () => {
    const map1 = parseMappingLanguage(`map "http://test.com/1" = test

    imports "http://test.com/2*"

    group example1(source src, target tgt) {
      src.name as sn -> tgt.name as tn then example2(sn, tn);
      src.name as sn -> tgt.name as tn then example3(sn, tn);
    }`);

    const map2 = parseMappingLanguage(`map "http://test.com/2first" = test
    group example2(source src, target tgt) {
      src.firstName as ss -> tgt.firstName = ss;
    }`);

    const map3 = parseMappingLanguage(`map "http://test.com/2last" = test
    group example3(source src, target tgt) {
      src.lastName as ss -> tgt.lastName = ss;
    }`);

    const maps = new TransformMapCollection([map1, map2, map3]);

    const input = [toTypedValue({ name: { firstName: 'Bob', lastName: 'Smith' } })];
    const actual = structureMapTransform(map1, input, maps);
    const expected = input;
    expect(actual).toMatchObject(expected);
  });
});

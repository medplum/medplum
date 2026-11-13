// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AllergyIntolerance } from '@medplum/fhirtypes';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { convertXmlToCcda } from './xml';

const testDataFolder = resolve(__dirname, '../testdata');

function convertAllergy(valueCode: string, codeSystem = '2.16.840.1.113883.6.96'): AllergyIntolerance {
  const xml = readFileSync(join(testDataFolder, 'AllergyToEgg.xml'), 'utf8')
    .replace('code="414285001"', `code="${valueCode}"`)
    .replace(/(code="[^"]*"\s+displayName="Allergy to food \(finding\)"\s+codeSystem=")[^"]*/, `$1${codeSystem}`);
  const bundle = convertCcdaToFhir(convertXmlToCcda(xml));
  return bundle.entry?.find((e) => e.resource?.resourceType === 'AllergyIntolerance')?.resource as AllergyIntolerance;
}

describe('C-CDA allergy type and category', () => {
  test.each([
    ['416098002', ['medication'], 'allergy'],
    ['59037007', ['medication'], 'intolerance'],
    ['419511003', ['medication'], undefined],
    ['414285001', ['food'], 'allergy'],
    ['235719002', ['food'], 'intolerance'],
    ['426232007', ['environment'], 'allergy'],
    ['12481000132103', ['biologic'], 'allergy'],
    ['609328004', undefined, 'allergy'],
    ['420134006', undefined, undefined],
  ])('observation value %s', (code, category, type) => {
    const allergy = convertAllergy(code);
    expect(allergy.category).toEqual(category);
    expect(allergy.type).toEqual(type);
  });

  test('does not default to food for a code outside the value set', () => {
    const allergy = convertAllergy('123456');
    expect(allergy.category).toBeUndefined();
    expect(allergy.type).toBeUndefined();
  });

  test('ignores a matching code from another code system', () => {
    const allergy = convertAllergy('59037007', '2.16.840.1.113883.6.88');
    expect(allergy.category).toBeUndefined();
    expect(allergy.type).toBeUndefined();
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { AllergyIntolerance } from '@medplum/fhirtypes';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { ALLERGY_TYPE_MAPPING } from './systems';
import { convertXmlToCcda } from './xml';

const testDataFolder = resolve(__dirname, '../testdata');

const allergyMappings: [string, Pick<AllergyIntolerance, 'category' | 'type'>][] = [
  ...Object.entries(ALLERGY_TYPE_MAPPING),
  ['418038007', {}],
  ['420134006', {}],
  ['999999999', {}],
];

describe('C-CDA allergy conversion', () => {
  test.each(allergyMappings)('maps SNOMED code %s to %o', (code, expected) => {
    const xml = readFileSync(join(testDataFolder, 'AllergyNullFlavorReaction.xml'), 'utf8');

    const ccda = convertXmlToCcda(xml);

    const section = ccda.component?.structuredBody.component[0].section[0];
    const act = section?.entry?.[0]?.act?.[0];
    const observation = act?.entryRelationship?.[0]?.observation?.[0];

    if (!observation) {
      throw new Error('Allergy observation not found in test fixture');
    }

    (observation.value as { '@_code'?: string })['@_code'] = code;

    const bundle = convertCcdaToFhir(ccda);

    const allergy = bundle.entry?.find((entry) => entry.resource?.resourceType === 'AllergyIntolerance')?.resource as
      AllergyIntolerance | undefined;

    expect(allergy).toBeDefined();
    expect(allergy?.category).toEqual(expected.category);
    expect(allergy?.type).toBe(expected.type);
  });
});

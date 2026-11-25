// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { AllergyIntolerance } from '@medplum/fhirtypes';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { convertXmlToCcda } from './xml';

const testDataFolder = resolve(__dirname, '../testdata');

const allergyMappings = [
  ['416098002', 'medication', 'allergy'],
  ['59037007', 'medication', 'intolerance'],
  ['419511003', 'medication', undefined],
  ['414285001', 'food', 'allergy'],
  ['235719002', 'food', 'intolerance'],
  ['418471000', 'food', undefined],
  ['426232007', 'environment', 'allergy'],
  ['444316004', 'environment', 'allergy'],
  ['12481000132103', 'biologic', 'allergy'],
  ['419199007', undefined, 'allergy'],
  ['609328004', undefined, 'allergy'],
  ['418038007', undefined, undefined],
  ['420134006', undefined, undefined],
  ['999999999', undefined, undefined],
] as const;

describe('C-CDA allergy conversion', () => {
  test.each(allergyMappings)('maps SNOMED code %s to category %s and type %s', (code, category, type) => {
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
    expect(allergy?.category).toEqual(category ? [category] : undefined);
    expect(allergy?.type).toBe(type);
  });
});

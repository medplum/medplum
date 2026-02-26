// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Immunization } from '@medplum/fhirtypes';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { convertXmlToCcda } from './xml';

const testDataFolder = resolve(__dirname, '../testdata');

describe('nullFlavor handling', () => {
  test('lotNumberText with nullFlavor is omitted from Immunization', () => {
    const ccda = convertXmlToCcda(readFileSync(join(testDataFolder, 'ImmunizationNullFlavorLotNumber.xml'), 'utf8'));
    const bundle = convertCcdaToFhir(ccda);
    const immunization = bundle.entry?.find((e) => e.resource?.resourceType === 'Immunization')
      ?.resource as Immunization;
    expect(immunization).toBeDefined();
    expect(immunization.lotNumber).toBeUndefined();
  });

  test('code with nullFlavor and translation produces clean coding array', () => {
    const ccda = convertXmlToCcda(
      readFileSync(join(testDataFolder, 'ImmunizationNullFlavorCodeWithTranslation.xml'), 'utf8')
    );
    const bundle = convertCcdaToFhir(ccda);
    const immunization = bundle.entry?.find((e) => e.resource?.resourceType === 'Immunization')
      ?.resource as Immunization;
    expect(immunization).toBeDefined();

    const codings = immunization.vaccineCode?.coding;
    expect(codings).toBeDefined();
    expect(codings?.length).toBe(1);
    expect(codings?.[0]).toEqual({
      system: 'http://loinc.org',
      code: '75320-2',
      display: 'Advance directive',
    });
    for (const coding of codings ?? []) {
      expect(coding).not.toBeNull();
    }
  });
});

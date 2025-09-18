// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { stringify } from '@medplum/core';
import { Bundle, Resource } from '@medplum/fhirtypes';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { convertFhirToCcda } from './fhir-to-ccda/convert';
import { Ccda } from './types';
import { convertCcdaToXml, convertXmlToCcda } from './xml';

const testDataFolder = resolve(__dirname, '../testdata');
const testData = [
  'MinimalPassingValidator',
  'Patient',
  'Participants',
  'AllergyToEgg',
  'MedicationAtBedtime',
  'ProblemPneumonia',
  'ImmunizationInfluenza',
  'VitalSignsGrowthCharts',
  'VitalSignsMetricUnits',
  'SmokingStatus',
  'PlanOfTreatmentCarePlan',
  'PlanOfTreatmentCarePlanGoals',
  // 'HealthConcerns',
  'ProcedureSectionActEntry',
  'ProcedureSectionObservationEntry',
  'ProcedureSectionProcedureEntry',
  // 'EncounterHospitalDischarge',
];

describe('convertCcdaToFhir', () => {
  test.skip('generateCleanCcda', () => {
    const name = 'MinimalPassingValidator';
    const ccda = convertXmlToCcda(readFileSync(join(testDataFolder, `${name}.xml`), 'utf8'));
    writeFileSync(join(testDataFolder, `${name}.clean.xml`), convertCcdaToXml(ccda));
  });

  test.each(testData)('should convert %s CCDA to FHIR', (name) => {
    const ccda = convertXmlToCcda(readFileSync(join(testDataFolder, `${name}.xml`), 'utf8'));
    const bundle = normalizeFhir(convertCcdaToFhir(ccda));

    if (!existsSync(join(testDataFolder, `${name}.json`))) {
      writeFileSync(join(testDataFolder, `${name}.json`), stringify(bundle, true));
    }

    const expected = JSON.parse(readFileSync(join(testDataFolder, `${name}.json`), 'utf8'));
    expect(bundle).toEqual(expected);
  });

  test('unrecognized act element', () => {
    // Start with a valid CCDA XML file
    const ccda = convertXmlToCcda(readFileSync(join(testDataFolder, 'ProcedureSectionActEntry.xml'), 'utf8'));

    // Change the section template ID to an unrecognized value
    (ccda as any).component.structuredBody.component[0].section[0].templateId[0]['@_root'] = '9.9.9999';

    // By default, this should throw an error
    expect(() => convertCcdaToFhir(ccda)).toThrow('Unhandled act templateId: 9.9.9999');

    // Or we can ignore it
    const bundle = convertCcdaToFhir(ccda, { ignoreUnsupportedSections: true });
    expect(bundle).toBeDefined();
  });

  test('unrecognized substanceAdministration element', () => {
    // Start with a valid CCDA XML file
    const ccda = convertXmlToCcda(readFileSync(join(testDataFolder, 'MedicationAtBedtime.xml'), 'utf8'));

    // Change the section template ID to an unrecognized value
    (ccda as any).component.structuredBody.component[0].section[0].templateId[0]['@_root'] = '9.9.9999';

    // By default, this should throw an error
    expect(() => convertCcdaToFhir(ccda)).toThrow('Unhandled substance administration templateId: 9.9.9999');

    // Or we can ignore it
    const bundle = convertCcdaToFhir(ccda, { ignoreUnsupportedSections: true });
    expect(bundle).toBeDefined();
  });
});

describe('convertFhirToCcda', () => {
  test.each(testData)('should convert %s FHIR to CCDA', (name) => {
    const bundle = JSON.parse(readFileSync(join(testDataFolder, `${name}.json`), 'utf8')) as Bundle;
    const result = normalizeCcda(convertFhirToCcda(bundle));
    const expected = convertXmlToCcda(readFileSync(join(testDataFolder, `${name}.xml`), 'utf8'));
    expect(result).toEqual(expected);
  });
});

function normalizeFhir<T extends Resource>(resource: T): T {
  // We need to remove all "empty" elements, such as empty strings and empty objects
  // This is because FHIR is very strict about what is allowed in the JSON
  return JSON.parse(stringify(resource)) as T;
}

function normalizeCcda(ccda: Ccda): Ccda {
  try {
    return convertXmlToCcda(convertCcdaToXml(ccda));
  } catch (err) {
    console.log(JSON.stringify(ccda, null, 2));
    throw err;
  }
}

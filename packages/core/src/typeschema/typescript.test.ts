// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import type { Bundle, StructureDefinition } from '@medplum/fhirtypes';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getDataType, indexStructureDefinitionBundle, parseStructureDefinition } from './types';
import { generateTypeScriptDefinition, generateTypeScriptDefinitions } from './typescript';

describe('generateTypeScriptDefinition', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('Base resource', () => {
    const result = generateTypeScriptDefinition(getDataType('Patient'), {
      getValueSetValues: (url) =>
        url.startsWith('http://hl7.org/fhir/ValueSet/administrative-gender') ? ['male', 'female'] : [],
    });
    expect(result).toContain("import type { Address } from './Address.d.ts';");
    expect(result).toContain('export interface Patient {');
    expect(result).toContain("readonly resourceType: 'Patient';");
    expect(result).toContain("gender?: 'male' | 'female';");
    expect(result).toContain('generalPractitioner?: Reference<Organization | Practitioner | PractitionerRole>[];');
    expect(result).toContain('export interface PatientContact {');
    expect(result).toContain('export type PatientDeceased = boolean | string;');
  });

  test('Profile', () => {
    const sd = JSON.parse(
      readFileSync(resolve(__dirname, '__test__', 'us-core-patient.json'), 'utf8')
    ) as StructureDefinition;
    const result = generateTypeScriptDefinition(parseStructureDefinition(sd), {
      getImportPath: () => '@medplum/fhirtypes',
    });
    expect(result).toContain('import type { Address, ');
    expect(result).toContain("'@medplum/fhirtypes';");
    expect(result).not.toContain('.d.ts');
    expect(result).toContain('export interface USCorePatientProfile {');
    expect(result).toContain("readonly resourceType: 'Patient';");
    expect(result).toContain('identifier: Identifier[];');
    expect(result).toContain('name: HumanName[];');
    // Unresolved bindings fall back to the base property type
    expect(result).toContain("gender: NonNullable<Patient['gender']>;");
    // Inner types are renamed so they don't conflict with the base types
    expect(result).toContain('contact?: USCorePatientProfileContact[];');
    expect(result).toContain('export interface USCorePatientProfileContact {');
    expect(result).toContain("gender?: NonNullable<PatientContact['gender']>;");
    // Constraints on data type elements (e.g. "identifier.system") are not flattened into the resource
    expect(result).not.toMatch(/^ {2}system/m);
  });

  test('Multiple profiles', () => {
    const bloodPressure = JSON.parse(
      readFileSync(resolve(__dirname, '__test__', 'us-core-blood-pressure.json'), 'utf8')
    ) as StructureDefinition;
    const patient = JSON.parse(
      readFileSync(resolve(__dirname, '__test__', 'us-core-patient.json'), 'utf8')
    ) as StructureDefinition;
    const files = generateTypeScriptDefinitions([bloodPressure, patient]);
    expect(Object.keys(files).sort()).toStrictEqual([
      'USCoreBloodPressureProfile.d.ts',
      'USCorePatientProfile.d.ts',
      'index.d.ts',
    ]);
    expect(files['index.d.ts']).toContain("export type { USCorePatientProfile } from './USCorePatientProfile.d.ts';");
    expect(files['USCoreBloodPressureProfile.d.ts']).toContain("readonly resourceType: 'Observation';");
    expect(files['USCoreBloodPressureProfile.d.ts']).toContain('subject: Reference<Patient>;');
    // References to profiles that are not loaded fall back to the base property type
    expect(files['USCoreBloodPressureProfile.d.ts']).toContain("hasMember?: NonNullable<Observation['hasMember']>;");
  });

  test('No elements', () => {
    expect(generateTypeScriptDefinition({ name: 'Empty', type: 'Empty', elements: {} } as any)).toBeUndefined();
  });
});

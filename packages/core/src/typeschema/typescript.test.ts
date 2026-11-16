// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import type { Bundle, StructureDefinition } from '@medplum/fhirtypes';
import { getDataType, indexStructureDefinitionBundle } from './types';
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

  test('Profiles', () => {
    const files = generateTypeScriptDefinitions(
      readJson('fhir/r4/testing/uscore-v5.0.1-structuredefinitions.json') as StructureDefinition[]
    );
    expect(files['index.d.ts']).toContain("export type { USCorePatientProfile } from './USCorePatientProfile.d.ts';");

    const patient = files['USCorePatientProfile.d.ts'];
    expect(patient).toContain('import type { Address, ');
    expect(patient).toContain("'@medplum/fhirtypes';");
    expect(patient).not.toContain('.d.ts');
    expect(patient).toContain('export interface USCorePatientProfile {');
    expect(patient).toContain("readonly resourceType: 'Patient';");
    expect(patient).toContain('identifier: Identifier[];');
    // Unresolved bindings fall back to the base property type
    expect(patient).toContain("gender: NonNullable<Patient['gender']>;");
    // Inner types are renamed so they don't conflict with the base types
    expect(patient).toContain('contact?: USCorePatientProfileContact[];');
    expect(patient).toContain('export interface USCorePatientProfileContact {');
    expect(patient).toContain("gender?: NonNullable<PatientContact['gender']>;");
    // Constraints on data type elements (e.g. "identifier.system") are not flattened into the resource
    expect(patient).not.toMatch(/^ {2}system/m);

    const bloodPressure = files['USCoreBloodPressureProfile.d.ts'];
    expect(bloodPressure).toContain("readonly resourceType: 'Observation';");
    expect(bloodPressure).toContain('subject: Reference<Patient>;');
    // References to profiles that are not loaded fall back to the base property type
    expect(bloodPressure).toContain("hasMember?: NonNullable<Observation['hasMember']>;");
    // Choice types are restricted to the profile's types
    expect(bloodPressure).toContain('effectiveDateTime?: string;');
    expect(bloodPressure).toContain('effectivePeriod?: Period;');
    expect(bloodPressure).not.toContain('effectiveInstant');

    // Profiles can restrict arrays to 0..1, but they are still arrays in JSON
    expect(files['USCoreImplantableDeviceProfile.d.ts']).toContain(
      'udiCarrier?: USCoreImplantableDeviceProfileUdiCarrier[];'
    );
  });

  test('No elements', () => {
    expect(generateTypeScriptDefinition({ name: 'Empty', type: 'Empty', elements: {} } as any)).toBeUndefined();
  });
});

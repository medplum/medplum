// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { indexStructureDefinitionBundle, validateResource } from '@medplum/core';
import { getDataDir, readJson } from '@medplum/definitions';
import type { Bundle, Patient, StructureDefinition } from '@medplum/fhirtypes';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { main } from '.';

const US_CORE_PROFILES = resolve(getDataDir(), 'fhir/r4/testing/uscore-v5.0.1-structuredefinitions.json');

const HEADER = `
import type { MedplumClient } from '@medplum/core';
import type { Observation, Patient } from '@medplum/fhirtypes';
import type { USCoreBloodPressureProfile, USCorePatientProfile } from './index.d.ts';
`;

const validPatient = {
  resourceType: 'Patient',
  identifier: [{ system: 'http://hospital.example.org', value: '123' }],
  name: [{ family: 'Smith', given: ['Jane'] }],
  gender: 'female',
};

const validBloodPressure = {
  resourceType: 'Observation',
  status: 'final',
  category: [
    { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] },
  ],
  code: { coding: [{ system: 'http://loinc.org', code: '85354-9' }] },
  subject: { reference: 'Patient/123' },
  effectiveDateTime: '2026-01-01T00:00:00Z',
  component: [
    { code: { coding: [{ system: 'http://loinc.org', code: '8480-6' }] }, valueQuantity: { value: 120 } },
    { code: { coding: [{ system: 'http://loinc.org', code: '8462-4' }] }, valueQuantity: { value: 80 } },
  ],
};

// Type-valid, but US Core also requires identifier.system, which is not enforced by the generated types
const patientMissingIdentifierSystem = { ...validPatient, identifier: [{ value: '123' }] };

const patient = (value: object): string => `export const p: USCorePatientProfile = ${JSON.stringify(value)};`;
const bloodPressure = (value: object): string =>
  `export const o: USCoreBloodPressureProfile = ${JSON.stringify(value)};`;
const omit = (value: Record<string, unknown>, key: string): object =>
  Object.fromEntries(Object.entries(value).filter(([k]) => k !== key));

// Each snippet is type checked against the generated US Core types.
// Valid snippets must have no errors. Invalid snippets must have an error that includes the expected message.
const CASES: { name: string; code: string; error?: string }[] = [
  // Valid resources
  { name: 'valid US Core Patient', code: patient(validPatient) },
  { name: 'valid US Core Blood Pressure', code: bloodPressure(validBloodPressure) },
  { name: 'type-valid Patient missing identifier.system', code: patient(patientMissingIdentifierSystem) },
  {
    name: 'profile types are assignable to base types and MedplumClient methods',
    code: `
      declare const medplum: MedplumClient;
      declare const patient: USCorePatientProfile;
      declare const bp: USCoreBloodPressureProfile;
      export const base: Patient = patient;
      export const created: Promise<Patient> = medplum.createResource(patient);
      export const updated: Promise<Observation> = medplum.updateResource(bp);
    `,
  },

  // Profile constraints (all of these are valid for the base types)
  {
    name: 'base Patient does not require identifier, name, or gender',
    code: `export const p: Patient = { resourceType: 'Patient' };`,
  },
  {
    name: 'profile requires Patient.identifier',
    code: patient(omit(validPatient, 'identifier')),
    error: "Property 'identifier' is missing",
  },
  {
    name: 'profile requires Patient.name',
    code: patient(omit(validPatient, 'name')),
    error: "Property 'name' is missing",
  },
  {
    name: 'profile requires Patient.gender',
    code: patient(omit(validPatient, 'gender')),
    error: "Property 'gender' is missing",
  },
  {
    name: 'profile requires Observation.subject',
    code: bloodPressure(omit(validBloodPressure, 'subject')),
    error: "Property 'subject' is missing",
  },
  {
    name: 'profile requires Observation.component',
    code: bloodPressure(omit(validBloodPressure, 'component')),
    error: "Property 'component' is missing",
  },
  {
    name: 'base Observation allows effectiveInstant',
    code: `export const o: Observation = { resourceType: 'Observation', status: 'final', code: {}, effectiveInstant: '2026-01-01T00:00:00Z' };`,
  },
  {
    name: 'profile restricts Observation.effective[x] to dateTime or Period',
    code: bloodPressure({
      ...omit(validBloodPressure, 'effectiveDateTime'),
      effectiveInstant: '2026-01-01T00:00:00Z',
    }),
    error: `'"effectiveInstant"' does not exist in type 'USCoreBloodPressureProfile'`,
  },

  // Base type constraints
  {
    name: 'base requires a valid Patient.gender code',
    code: patient({ ...validPatient, gender: 'nope' }),
    error: `Type '"nope"' is not assignable to type 'NonNullable<"female" | "male" | "other" | "unknown" | undefined>'`,
  },
  {
    name: 'base requires a valid Observation.status code',
    code: bloodPressure({ ...validBloodPressure, status: 'done' }),
    error: `Type '"done"' is not assignable to type`,
  },
  {
    name: 'base requires the resourceType',
    code: patient({ ...validPatient, resourceType: 'Practitioner' }),
    error: `Type '"Practitioner"' is not assignable to type '"Patient"'`,
  },
  {
    name: 'base does not allow unknown properties',
    code: patient({ ...validPatient, favoriteColor: 'blue' }),
    error: `'"favoriteColor"' does not exist in type 'USCorePatientProfile'`,
  },
  {
    name: 'base requires primitive types',
    code: patient({ ...validPatient, birthDate: 19900101 }),
    error: "Type 'number' is not assignable to type 'string'",
  },
  {
    name: 'base requires arrays for repeating elements',
    code: patient({ ...validPatient, name: { family: 'Smith' } }),
    error: `'"family"' does not exist in type 'HumanName[]'`,
  },
  {
    name: 'base requires Patient.link.type',
    code: patient({ ...validPatient, link: [{ other: { reference: 'Patient/456' } }] }),
    error: "Property 'type' is missing",
  },
];

describe('CLI generate-types type checking', () => {
  let outputDir: string;
  let errors: Record<string, string[]>;

  beforeAll(async () => {
    console.log = vi.fn();
    outputDir = mkdtempSync(join(tmpdir(), 'medplum-generate-types-'));
    await main(['node', 'index.js', 'generate-types', US_CORE_PROFILES, '--output-dir', outputDir]);

    const fileNames = CASES.map((c, i) => {
      const fileName = join(outputDir, `case${i}.ts`);
      writeFileSync(fileName, HEADER + c.code, 'utf8');
      return fileName;
    });

    const program = ts.createProgram(fileNames, {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      paths: {
        '@medplum/core': [resolve(import.meta.dirname, '../../core/dist/esm/index.d.ts')],
        '@medplum/fhirtypes': [resolve(import.meta.dirname, '../../fhirtypes/dist/index.d.ts')],
      },
    });
    errors = Object.fromEntries(
      CASES.map((c, i) => [
        c.name,
        ts
          .getPreEmitDiagnostics(program, program.getSourceFile(fileNames[i]))
          .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
      ])
    );
  }, 120_000);

  afterAll(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  test.each(CASES.filter((c) => !c.error).map((c) => c.name))('Accepts: %s', (name) => {
    expect(errors[name]).toStrictEqual([]);
  });

  test.each(CASES.filter((c) => c.error).map((c) => [c.name, c.error as string]))('Rejects: %s', (name, expected) => {
    expect(errors[name].join('\n')).toContain(expected);
  });

  test('Runtime validation covers profile constraints that types cannot express', () => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    const sds = JSON.parse(readFileSync(US_CORE_PROFILES, 'utf8')) as StructureDefinition[];
    const profile = sds.find((sd) => sd.name === 'USCorePatientProfile') as StructureDefinition;

    expect(() => validateResource(validPatient as Patient, { profile })).not.toThrow();
    // Accepted by the type checker above, but rejected by the validator
    expect(() => validateResource(patientMissingIdentifierSystem as Patient, { profile })).toThrow(
      'Missing required property (Patient.identifier[0].system)'
    );
  });
});

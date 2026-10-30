// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, validateResource } from '@medplum/core';
import type { ResourceType } from '@medplum/fhirtypes';
import assert from 'node:assert/strict';
import { generateMockResources } from './generate-mock';
import { createMockClient, createMockState } from './mock-state';

const types: ResourceType[] = [
  'Patient',
  'Organization',
  'Coverage',
  'Condition',
  'AllergyIntolerance',
  'MedicationRequest',
  'MedicationStatement',
  'Immunization',
  'Goal',
  'ServiceRequest',
  'DiagnosticReport',
  'Observation',
];

test.each(types)('generates required %s structure from bundled definitions', async (type) => {
  const resources = generateMockResources(type, 1);
  await createMockClient(createMockState(resources, {}));
  expect(validateResource(resources[0])).toEqual([]);
  expect(resources[0].resourceType).toBe(type);
});

test('six patients fill only requested optional fields and preserve authored nested values', () => {
  const values = { name: [{ family: 'Demo' }], active: false };
  const options = { fields: ['name.given', 'birthDate'], values };
  const patients = generateMockResources('Patient', 6, options);
  expect(patients).toEqual(generateMockResources('Patient', 6, options));
  expect(new Set(patients.map((p) => p.id)).size).toBe(6);
  for (const [index, patient] of patients.entries()) {
    expect(patient.name).toEqual([{ family: 'Demo', given: [`Example name.given ${index + 1}`] }]);
    expect(patient.birthDate).toBe('2020-05-04');
    expect(patient.active).toBe(false);
    expect(patient.gender).toBeUndefined();
    expect(patient.address).toBeUndefined();
  }
  expect(values).toEqual({ name: [{ family: 'Demo' }], active: false });
  assert(patients[0].name && patients[1].name);
  patients[0].name[0].family = 'Changed';
  expect(patients[1].name[0].family).toBe('Demo');
  expect(generateMockResources('Patient', 1)).toEqual([{ resourceType: 'Patient', id: 'patient-1' }]);
});

test('generates bound codes and respects explicit choice variants', () => {
  const patients = generateMockResources('Patient', 4, { fields: ['gender'] });
  expect(patients.map((p) => p.gender)).toEqual(['male', 'female', 'other', 'unknown']);
  const [medication] = generateMockResources('MedicationRequest', 1, {
    values: { medicationReference: { reference: 'Medication/custom' }, subject: createReference(patients[0]) },
  });
  expect(medication.medicationCodeableConcept).toBeUndefined();
  expect(medication.medicationReference?.reference).toBe('Medication/custom');
  const [immunization] = generateMockResources('Immunization', 1, { fields: ['occurrenceString'] });
  expect(immunization.occurrenceString).toBe('Example occurrenceString 1');
  expect(immunization.occurrenceDateTime).toBeUndefined();
});

test('per-resource values provide explicit relationships without generating target resources', async () => {
  const patients = generateMockResources('Patient', 6);
  const observations = generateMockResources('Observation', 6, {
    values: (index) => ({ subject: createReference(patients[index]), valueInteger: index }),
  });
  const client = await createMockClient(createMockState([...patients, ...observations], {}));
  expect(await client.searchResources('Patient', {})).toHaveLength(6);
  for (const [index, patient] of patients.entries()) {
    const found = await client.searchResources('Observation', { patient: `Patient/${patient.id}` });
    expect(found).toHaveLength(1);
    expect(found[0].valueInteger).toBe(index);
  }
});

test('rejects unknown paths, missing schemas, invalid counts and conflicting choices', () => {
  expect(() => generateMockResources('Patient', -1)).toThrow('count');
  expect(() => generateMockResources('Patient', 1, { fields: ['name.noSuchField'] })).toThrow('field');
  expect(() => generateMockResources('Patient', 1, { fields: ['gender.value'] })).toThrow('field');
  expect(() => generateMockResources('Patient', 1, { fields: ['contact'] })).toThrow('child fields');
  expect(() => generateMockResources('ResearchDefinition', 1)).toThrow('StructureDefinition');
  expect(() =>
    generateMockResources('MedicationRequest', 1, {
      values: { medicationCodeableConcept: { text: 'Example' }, medicationReference: { reference: 'Medication/x' } },
    })
  ).toThrow('Multiple choice');
});

test('requested whole datatypes generate display values without filling unrelated fields', () => {
  const [patient] = generateMockResources('Patient', 1, { fields: ['name'] });
  expect(patient.name).toEqual([{ text: 'Example name.text 1' }]);
  expect(patient.birthDate).toBeUndefined();
});

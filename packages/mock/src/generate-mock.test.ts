// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, deepClone, tryGetProfile, validateResource } from '@medplum/core';
import type { ElementDefinition, Extension, ResourceType, StructureDefinition } from '@medplum/fhirtypes';
import assert from 'node:assert/strict';
import { MockClient } from './client';
import { generateMockResources } from './generate-mock';
import { createMockClient, createMockState } from './mock-state';
import { mockPatientProfile } from './mocks/states/mock-patient-profile';
import definitions from './mocks/structuredefinitions.json';

function profile(type: ResourceType, changes: ElementDefinition[]): StructureDefinition {
  const base = (definitions as StructureDefinition[]).find((sd) => sd.type === type);
  assert(base?.snapshot);
  const elements = deepClone(base.snapshot.element);
  for (const change of changes) {
    const position = elements.findIndex((ed) => ed.path === change.path);
    const original = elements[position];
    const entry = {
      ...original,
      base: original?.base ?? { path: change.path, min: original?.min ?? 0, max: original?.max ?? change.max ?? '1' },
      ...change,
    };
    if (position >= 0) {
      elements[position] = entry;
    } else {
      const parent = change.path.slice(0, change.path.lastIndexOf('.'));
      const parentIndex = elements.findIndex((ed) => ed.path === parent);
      assert(parentIndex >= 0);
      elements.splice(parentIndex + 1, 0, entry);
    }
  }
  return {
    resourceType: 'StructureDefinition',
    url: `https://example.com/StructureDefinition/test-${type}`,
    name: `Test${type}`,
    status: 'draft',
    kind: 'resource',
    abstract: false,
    type,
    baseDefinition: `http://hl7.org/fhir/StructureDefinition/${type}`,
    derivation: 'constraint',
    snapshot: { element: elements },
  };
}

beforeAll(async () => {
  await new MockClient().get('/');
});

test('base Patient has only stable IDs, with no unsolicited demographics', () => {
  const patients = generateMockResources('Patient', 6);
  expect(patients).toEqual(generateMockResources('Patient', 6));
  expect(patients).toEqual(Array.from({ length: 6 }, (_, i) => ({ resourceType: 'Patient', id: `patient-${i + 1}` })));
  expect(generateMockResources('Patient', 0)).toEqual([]);
  expect(
    generateMockResources('Patient', 1, { idPrefix: 'other', values: { active: false, multipleBirthInteger: 0 } })
  ).toEqual([{ resourceType: 'Patient', id: 'other-1', active: false, multipleBirthInteger: 0 }]);
  expect(generateMockResources('Patient', 1, { values: { id: 'authored' } })[0].id).toBe('authored');
});

test('six profiled patients fill nested required fields and preserve authored family names', () => {
  const values = { name: [{ family: 'Demo' }], active: false };
  const options = { profile: mockPatientProfile, values };
  const savedProfile = deepClone(mockPatientProfile);
  const patients = generateMockResources('Patient', 6, options);
  expect(patients).toEqual(generateMockResources('Patient', 6, options));
  for (const [index, patient] of patients.entries()) {
    expect(patient.name).toEqual([{ family: 'Demo', given: [`Example name.given ${index + 1}`] }]);
    expect(patient.birthDate).toBe('2020-05-04');
    expect(patient.active).toBe(false);
    expect(patient.gender).toBeUndefined();
    expect(patient.address).toBeUndefined();
    expect(patient.meta).toBeUndefined();
    expect(validateResource(patient, { profile: mockPatientProfile })).toEqual([]);
  }
  assert(patients[0].name && patients[1].name);
  patients[0].name[0].family = 'Changed';
  expect(patients[1].name[0].family).toBe('Demo');
  expect(values).toEqual({ name: [{ family: 'Demo' }], active: false });
  expect(mockPatientProfile).toEqual(savedProfile);
  expect(tryGetProfile(mockPatientProfile.url)).toBeUndefined();
});

test('optional parents stay absent; supplied parents get required children', () => {
  const sd = profile('Patient', [
    { path: 'Patient.telecom.value', min: 1, max: '1', type: [{ code: 'string' }] },
    { path: 'Patient.name', mustSupport: true },
  ]);
  expect(generateMockResources('Patient', 1, { profile: sd })[0]).toEqual({ resourceType: 'Patient', id: 'patient-1' });
  expect(generateMockResources('Patient', 1, { profile: sd, values: { telecom: [{}] } })[0].telecom).toEqual([
    { value: 'Example telecom.value 1' },
  ]);
});

test('pads empty or short required arrays and preserves array shape at max=1', () => {
  const sd = profile('Patient', [
    { path: 'Patient.identifier', min: 2 },
    { path: 'Patient.identifier.value', min: 1, max: '1', type: [{ code: 'string' }] },
    { path: 'Patient.name', min: 1, max: '1' },
    {
      path: 'Patient.name.given',
      min: 1,
      max: '1',
      base: { path: 'HumanName.given', min: 0, max: '*' },
      type: [{ code: 'string' }],
    },
  ]);
  const [patient] = generateMockResources('Patient', 1, {
    profile: sd,
    values: { name: [], identifier: [{ value: 'keep' }] },
  });
  expect(patient.identifier).toEqual([{ value: 'keep' }, { value: 'Example identifier.value 1' }]);
  expect(patient.name).toEqual([{ given: ['Example name.given 1'] }]);
  expect(validateResource(patient, { profile: sd })).toEqual([]);
  expect(() =>
    generateMockResources('Patient', 1, { profile: sd, values: { name: [{ given: ['a'] }, { given: ['b'] }] } })
  ).toThrow('Patient.name: expected at most 1');
});

test('required fixed complex values and primitive patterns are cloned without adding optional defaults', () => {
  const sd = profile('Patient', [
    { path: 'Patient.name', min: 1, fixedHumanName: { given: ['Fixed'] } },
    { path: 'Patient.birthDate', min: 1, patternDate: '2000-01-01' },
    { path: 'Patient.active', fixedBoolean: true },
    { path: 'Patient.gender', patternCode: 'unknown' },
  ]);
  const saved = deepClone(sd);
  const patients = generateMockResources('Patient', 2, { profile: sd });
  expect(patients[0]).toEqual({
    resourceType: 'Patient',
    id: 'patient-1',
    name: [{ given: ['Fixed'] }],
    birthDate: '2000-01-01',
  });
  assert(patients[0].name);
  patients[0].name[0].given = ['Changed'];
  expect(patients[1].name).toEqual([{ given: ['Fixed'] }]);
  expect(sd).toEqual(saved);
  expect(() => generateMockResources('Patient', 1, { profile: sd, values: { name: [{ given: ['Wrong'] }] } })).toThrow(
    'Patient.name: value conflicts with fixed'
  );
  expect(() => generateMockResources('Patient', 1, { profile: sd, values: { birthDate: '1999-01-01' } })).toThrow(
    'Patient.birthDate: value does not include'
  );
  expect(() => generateMockResources('Patient', 1, { profile: sd, values: { active: false } })).toThrow(
    'Patient.active: value conflicts with fixed'
  );
});

test('required patterns supply complete objects without invented display text', () => {
  const pattern = { coding: [{ system: 'https://example.com/test-codes', code: 'fixture' }] };
  const sd = profile('Observation', [{ path: 'Observation.code', patternCodeableConcept: pattern }]);
  const [observation] = generateMockResources('Observation', 1, { profile: sd });
  expect(observation.code).toEqual(pattern);
  expect(validateResource(observation, { profile: sd })).toEqual([]);
  expect(() => generateMockResources('Observation', 1, { profile: sd, values: { code: { text: 'wrong' } } })).toThrow(
    'Observation.code: value does not include'
  );
  expect(() => generateMockResources('Observation', 1, { profile: sd, values: { code: { coding: [] } } })).toThrow(
    'Observation.code'
  );
});

test('requires authored references and never creates or guesses target resources', async () => {
  expect(() => generateMockResources('Condition', 1)).toThrow('Condition.subject: supply an explicit reference');
  const patients = generateMockResources('Patient', 6, { profile: mockPatientProfile });
  const observations = generateMockResources('Observation', 6, {
    values: (index) => ({
      subject: createReference(patients[index]),
      code: { text: 'Measurement' },
      valueInteger: index,
    }),
  });
  const state = createMockState([...patients, ...observations], {});
  const first = await createMockClient(state);
  const second = await createMockClient(state);
  expect(await first.searchResources('Patient', {})).toHaveLength(6);
  for (const [index, patient] of patients.entries()) {
    const found = await first.searchResources('Observation', { patient: `Patient/${patient.id}` });
    expect(found).toHaveLength(1);
    expect(found[0].valueInteger).toBe(index);
  }
  await first.updateResource({ ...observations[0], valueInteger: 100 });
  expect((await second.readResource('Observation', observations[0].id)).valueInteger).toBe(0);
});

test('requires an authored reference string when a profile requires Reference.reference', () => {
  const sd = profile('Condition', [
    { path: 'Condition.subject.reference', min: 1, max: '1', type: [{ code: 'string' }] },
  ]);
  const subject = { display: 'Synthetic patient' };
  expect(() => generateMockResources('Condition', 1, { profile: sd, values: { subject } })).toThrow(
    'Condition.subject.reference: supply an explicit reference'
  );
  expect(subject).toEqual({ display: 'Synthetic patient' });
  const reference = { ...subject, reference: 'Patient/one' };
  expect(generateMockResources('Condition', 1, { profile: sd, values: { subject: reference } })[0].subject).toEqual(
    reference
  );
  expect(generateMockResources('Condition', 1, { values: { subject } })[0].subject).toEqual(subject);
});

test('uses allowed authored choices and rejects ambiguous or forbidden variants', () => {
  const values = { patient: { reference: 'Patient/one' }, vaccineCode: { text: 'Example vaccine' } };
  expect(() => generateMockResources('Immunization', 1, { values })).toThrow('supply a choice value');
  const sd = profile('Immunization', [{ path: 'Immunization.occurrence[x]', type: [{ code: 'string' }] }]);
  const [immunization] = generateMockResources('Immunization', 1, { profile: sd, values });
  expect(immunization.occurrenceString).toBe('Example occurrence 1');
  expect(immunization.occurrenceDateTime).toBeUndefined();
  expect(() =>
    generateMockResources('Immunization', 1, { profile: sd, values: { ...values, occurrenceDateTime: '2020-01-01' } })
  ).toThrow('exactly one allowed choice');
  expect(() =>
    generateMockResources('Patient', 1, { values: { deceasedBoolean: false, deceasedDateTime: '2020-01-01' } })
  ).toThrow('exactly one allowed choice');
});

test('choice descendants keep profile constraints under the schema [x] path', () => {
  const sd = profile('Observation', [
    { path: 'Observation.value[x]', min: 1, type: [{ code: 'Quantity' }] },
    { path: 'Observation.value[x].value', min: 1, max: '1', type: [{ code: 'decimal' }] },
  ]);
  const [observation] = generateMockResources('Observation', 1, {
    profile: sd,
    values: { code: { text: 'Measurement' } },
  });
  expect(observation.valueQuantity).toEqual({ value: 1 });
  expect(observation.valueString).toBeUndefined();
});

test('fills inherited datatype requirements and constrained backbone descendants', () => {
  const sd = profile('Patient', [
    { path: 'Patient.contact', min: 1 },
    { path: 'Patient.contact.name', min: 1 },
    { path: 'Patient.contact.name.family', min: 1, max: '1', type: [{ code: 'string' }] },
  ]);
  expect(generateMockResources('Patient', 1, { profile: sd })[0].contact).toEqual([
    { name: { family: 'Example contact.name.family 1' } },
  ]);
  const [observation] = generateMockResources('Observation', 1, {
    profile: profile('Observation', [{ path: 'Observation.note', min: 1 }]),
    values: { code: { text: 'Measurement' } },
  });
  expect(observation.note).toEqual([{ text: 'Example note.text 1' }]);
  expect(validateResource(observation)).toEqual([]);
});

test('resolves local resource and datatype bindings, preferring explicit profile bindings', () => {
  const sd = profile('Patient', [
    {
      path: 'Patient.gender',
      min: 1,
      binding: { strength: 'required', valueSet: 'http://hl7.org/fhir/ValueSet/administrative-gender' },
    },
    { path: 'Patient.telecom', min: 1 },
    { path: 'Patient.telecom.system', min: 1, max: '1', type: [{ code: 'code' }] },
  ]);
  const patients = generateMockResources('Patient', 4, { profile: sd });
  expect(patients.map((p) => p.gender)).toEqual(['male', 'female', 'other', 'unknown']);
  expect(patients[0].telecom?.[0].system).toBe('phone');
  for (const valueSet of [
    'https://example.com/ValueSet/unavailable',
    'http://hl7.org/fhir/ValueSet/administrative-gender|missing',
  ]) {
    const missing = profile('Patient', [
      { path: 'Patient.gender', min: 1, binding: { strength: 'required', valueSet } },
    ]);
    expect(() => generateMockResources('Patient', 1, { profile: missing })).toThrow(
      'Patient.gender: no unambiguous local code list'
    );
    expect(generateMockResources('Patient', 1, { profile: missing, values: { gender: 'unknown' } })[0].gender).toBe(
      'unknown'
    );
  }
});

test('rejects missing values, prohibited fields, malformed profiles and invalid counts', () => {
  expect(() => generateMockResources('Patient', -1)).toThrow('count');
  expect(() => generateMockResources('Patient', 0.5)).toThrow('count');
  expect(() => generateMockResources('ResearchDefinition', 1)).toThrow('StructureDefinition');
  expect(() =>
    generateMockResources('Patient', 1, { profile: { ...mockPatientProfile, type: 'Observation' } })
  ).toThrow('resource type Patient');
  expect(() =>
    generateMockResources('Patient', 1, { profile: { ...mockPatientProfile, snapshot: undefined } })
  ).toThrow('resolved snapshot');
  expect(() =>
    generateMockResources('Patient', 1, { profile: profile('Patient', [{ path: 'Patient.name', min: 1 }]) })
  ).toThrow('Patient.name: supply a value or require a child');
  expect(() =>
    generateMockResources('Patient', 1, {
      profile: profile('Patient', [{ path: 'Patient.active', max: '0' }]),
      values: { active: false },
    })
  ).toThrow('Patient.active: the profile prohibits');
});

test('absent optional slices stay absent; required slices and dependent profiles fail clearly', () => {
  const sd = profile('Patient', [
    { path: 'Patient.extension', slicing: { discriminator: [{ type: 'value', path: 'url' }], rules: 'open' } },
  ]);
  assert(sd.snapshot);
  const position = sd.snapshot.element.findIndex((ed) => ed.path === 'Patient.extension');
  const slice: ElementDefinition = {
    id: 'Patient.extension:demo',
    path: 'Patient.extension',
    sliceName: 'demo',
    min: 0,
    max: '1',
    type: [{ code: 'Extension', profile: ['https://example.com/StructureDefinition/demo'] }],
  };
  sd.snapshot.element.splice(position + 1, 0, slice);
  expect(generateMockResources('Patient', 1, { profile: sd })[0]).toEqual({ resourceType: 'Patient', id: 'patient-1' });
  slice.min = 1;
  expect(() => generateMockResources('Patient', 1, { profile: sd })).toThrow('Patient.extension: required slices');
  const dependency = profile('Patient', [
    {
      path: 'Patient.name',
      min: 1,
      type: [{ code: 'HumanName', profile: ['https://example.com/StructureDefinition/name'] }],
    },
  ]);
  expect(() => generateMockResources('Patient', 1, { profile: dependency })).toThrow(
    'Patient.name: slices and dependent profiles'
  );
});

test('rejects unsupported primitive generation, profile dependencies and unresolved snapshot references', () => {
  const primitive = profile('Patient', [
    { path: 'Patient.photo', min: 1 },
    { path: 'Patient.photo.data', min: 1, max: '1', type: [{ code: 'base64Binary' }] },
  ]);
  expect(() => generateMockResources('Patient', 1, { profile: primitive })).toThrow(
    'Patient.photo.data: unsupported primitive'
  );
  const target = profile('Patient', [
    {
      path: 'Patient.managingOrganization',
      type: [{ code: 'Reference', targetProfile: ['https://example.com/StructureDefinition/organization'] }],
    },
  ]);
  expect(generateMockResources('Patient', 1, { profile: target })[0]).toEqual({
    resourceType: 'Patient',
    id: 'patient-1',
  });
  expect(() =>
    generateMockResources('Patient', 1, {
      profile: target,
      values: { managingOrganization: { reference: 'Organization/one' } },
    })
  ).toThrow('Patient.managingOrganization: slices and dependent profiles');
  const forward = profile('Observation', []);
  assert(forward.snapshot);
  forward.snapshot.element.sort((a, b) => a.path.localeCompare(b.path));
  expect(() => generateMockResources('Observation', 1, { profile: forward })).toThrow(
    'unsupported forward or external content reference'
  );
});

test('bounds recursion with a field-path error', () => {
  let extension: Extension = { url: 'https://example.com/deep' };
  for (let index = 0; index < 35; index++) {
    extension = { url: 'https://example.com/deep', extension: [extension] };
  }
  expect(() => generateMockResources('Patient', 1, { values: { extension: [extension] } })).toThrow(
    /Patient.extension.*recursive or too deep/
  );
});

test('preserves authored core quantities, doses and contained resources', () => {
  const values = { code: { text: 'Measurement' }, valueRange: { low: { value: 1 } } };
  expect(generateMockResources('Observation', 1, { values })[0].valueRange).toEqual(values.valueRange);
  const [medication] = generateMockResources('MedicationRequest', 1, {
    values: {
      subject: { reference: 'Patient/one' },
      medicationCodeableConcept: { text: 'Authored medication' },
      dosageInstruction: [{ doseAndRate: [{ doseQuantity: { value: 1 } }] }],
    },
  });
  expect(medication.dosageInstruction?.[0].doseAndRate?.[0].doseQuantity).toEqual({ value: 1 });
  const contained = [{ resourceType: 'Practitioner' as const, id: 'pr' }];
  const [patient] = generateMockResources('Patient', 1, { values: { contained } });
  expect(patient.contained).toEqual(contained);
  assert(patient.contained);
  patient.contained[0].id = 'edited';
  expect(contained[0].id).toBe('pr');
  const constrained = profile('Patient', [{ path: 'Patient.contained.id', min: 1, max: '1', type: [{ code: 'id' }] }]);
  expect(() => generateMockResources('Patient', 1, { profile: constrained, values: { contained } })).toThrow(
    'required contained resource child constraints'
  );
});

test.each(['nope', 1, null, []])('rejects a non-object contained entry: %j', (item) => {
  expect(() =>
    // @ts-expect-error Exercise malformed input from untyped callers.
    generateMockResources('Patient', 1, { values: { contained: [item] } })
  ).toThrow('Patient.contained: expected an object');
});

test('supports bare and versioned base reference targets', () => {
  const link = [{ project: { reference: 'Project/one' } }];
  expect(generateMockResources('Project', 1, { values: { link } })[0].link).toEqual(link);
  const owner = { reference: 'User/one' };
  const defaultPatientAccessPolicy = { reference: 'AccessPolicy/one' };
  const [project] = generateMockResources('Project', 1, { values: { owner, defaultPatientAccessPolicy } });
  expect(project.owner).toEqual(owner);
  expect(project.defaultPatientAccessPolicy).toEqual(defaultPatientAccessPolicy);
  const sd = profile('Condition', [
    {
      path: 'Condition.subject',
      type: [{ code: 'Reference', targetProfile: ['http://hl7.org/fhir/StructureDefinition/Patient|4.0.1'] }],
    },
  ]);
  const [condition] = generateMockResources('Condition', 1, {
    profile: sd,
    values: { subject: { reference: 'Patient/one' } },
  });
  expect(condition.subject.reference).toBe('Patient/one');
});

test('rejects required primitive children but leaves optional primitive metadata absent', () => {
  const sd = profile('Patient', [
    { path: 'Patient.birthDate', min: 1 },
    { path: 'Patient.birthDate.extension', min: 1, max: '*', type: [{ code: 'Extension' }] },
  ]);
  expect(() => generateMockResources('Patient', 1, { profile: sd })).toThrow(
    'Patient.birthDate.extension: required primitive child'
  );
  const nested = deepClone(mockPatientProfile);
  assert(nested.snapshot);
  nested.snapshot.element.splice(nested.snapshot.element.findIndex((ed) => ed.path === 'Patient.name.given') + 1, 0, {
    path: 'Patient.name.given.extension',
    min: 1,
    max: '*',
    type: [{ code: 'Extension' }],
  });
  expect(() => generateMockResources('Patient', 1, { profile: nested, values: { name: [{ given: ['A'] }] } })).toThrow(
    'Patient.name.given.extension: required primitive child'
  );
  const optional = profile('Patient', [
    { path: 'Patient.birthDate', min: 1 },
    { path: 'Patient.birthDate.extension', min: 0, max: '*', type: [{ code: 'Extension' }] },
    { path: 'Patient.birthDate.extension.url', min: 1, max: '1', type: [{ code: 'uri' }] },
  ]);
  expect(generateMockResources('Patient', 1, { profile: optional })[0]).toEqual({
    resourceType: 'Patient',
    id: 'patient-1',
    birthDate: '2020-05-04',
  });
});

test('supports ordinary deep authored data and supplied snapshots for unbundled types', () => {
  let extension: Extension = { url: 'https://example.com/deep' };
  for (let index = 0; index < 12; index++) {
    extension = { url: 'https://example.com/deep', extension: [extension] };
  }
  expect(generateMockResources('Patient', 1, { values: { extension: [extension] } })[0].extension).toEqual([extension]);
  const sd: StructureDefinition = {
    resourceType: 'StructureDefinition',
    name: 'DemoMedication',
    url: 'https://example.com/StructureDefinition/demo-medication',
    status: 'draft',
    kind: 'resource',
    abstract: false,
    type: 'Medication',
    snapshot: {
      element: [
        { path: 'Medication', min: 0, max: '*' },
        {
          path: 'Medication.code',
          min: 1,
          max: '1',
          type: [{ code: 'CodeableConcept' }],
          patternCodeableConcept: { text: 'Authored medication' },
        },
      ],
    },
  };
  expect(generateMockResources('Medication', 1, { profile: sd })[0]).toEqual({
    resourceType: 'Medication',
    id: 'medication-1',
    code: { text: 'Authored medication' },
  });
});

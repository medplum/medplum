// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Observation, Patient } from '@medplum/fhirtypes';
import { expectTypeOf } from 'vitest';
import { createMockClient, createMockState } from './mock-state';
import searchParameters from './mocks/searchparameters.json';
import { PatientSummaryStates } from './mocks/states';

const patient: WithId<Patient> = { resourceType: 'Patient', id: 'one', name: [{ text: 'First Patient' }] };
const other: WithId<Patient> = { resourceType: 'Patient', id: 'two' };
const observation: WithId<Observation> = {
  resourceType: 'Observation',
  id: 'heart-rate',
  status: 'final',
  code: { text: 'Heart rate' },
  subject: createReference(patient),
  valueQuantity: { value: 72 },
};

test('packages typed resources and named handles without changing them', () => {
  const state = createMockState([patient, observation], { patient });
  expectTypeOf(state.handles).toEqualTypeOf<{ patient: string }>();
  expect(state.handles).toEqual({ patient: 'Patient/one' });
  expect(state.resources).toEqual([patient, observation]);
  state.resources[0].id = 'changed';
  expect(patient.id).toBe('one');
});

test('rejects duplicate IDs and handles to missing resources', async () => {
  expect(() => createMockState([patient, patient], { patient })).toThrow('Duplicate');
  expect(() => createMockState([patient], { other })).toThrow('undeclared');
  await expect(createMockClient({ resources: [patient, patient], handles: {} })).rejects.toThrow('Duplicate');
  await expect(createMockClient({ resources: [patient], handles: { patient: 'Patient/missing' } })).rejects.toThrow(
    'undeclared'
  );
});

test('loads explicit references in isolated clients without extra patients', async () => {
  const state = createMockState([patient, other, observation], { patient, other });
  const saved = JSON.stringify(state);
  const first = await createMockClient(state);
  const second = await createMockClient(state);
  expect((await first.searchResources('Patient', {})).map((r) => r.id).sort()).toEqual(['one', 'two']);
  expect((await first.searchResources('Observation', { subject: state.handles.patient })).map((r) => r.id)).toEqual([
    'heart-rate',
  ]);
  expect(await first.searchResources('Observation', { subject: state.handles.other })).toHaveLength(0);
  await first.updateResource({ ...observation, valueQuantity: { value: 90 } });
  expect((await second.readResource('Observation', observation.id)).valueQuantity?.value).toBe(72);
  await first.updateResource({ ...observation, subject: createReference(other) });
  expect(await first.searchResources('Observation', { subject: state.handles.patient })).toHaveLength(0);
  expect((await first.searchResources('Observation', { subject: state.handles.other })).map((r) => r.id)).toEqual([
    'heart-rate',
  ]);
  expect(JSON.stringify(state)).toBe(saved);
});

test('bundled search parameters cover patient screens and existing lab filters', async () => {
  const state = PatientSummaryStates.busyPatient;
  const client = await createMockClient(state);
  expect((await client.searchResources('Condition', { patient: state.handles.patient })).map((r) => r.id)).toEqual([
    'hypertension',
  ]);
  expect(
    (await client.searchResources('Observation', { patient: state.handles.patient, code: '76690-7' })).map((r) => r.id)
  ).toEqual(['orientation']);
  expect(
    await client.searchResources('Observation', { patient: state.handles.patient, category: 'vital-signs' })
  ).toHaveLength(2);
  expect((await client.searchResources('Coverage', { beneficiary: state.handles.patient })).map((r) => r.id)).toEqual([
    'coverage',
  ]);
  for (const id of ['ServiceRequest-status', 'ServiceRequest-based-on', 'DiagnosticReport-status']) {
    expect(searchParameters.some((parameter) => parameter.id === id)).toBe(true);
  }
});

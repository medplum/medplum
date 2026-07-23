// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, DiagnosticReport, Observation, Patient, SearchParameter, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeAll, describe, expect, test } from 'vitest';
import { handler as idsrOruSenderHandler } from './idsr-oru-sender';
import { KENYA_IDSR_CODE_SYSTEM_URL, KENYA_IDSR_REVIEW_TASK_CODE, KENYA_IDSR_TASK_CODE_SYSTEM } from './kenya-idsr';

describe('Kenya IDSR ORU sender', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('returns an ORU^R01 message and records a Communication after review completion', async () => {
    const { medplum, task } = await setupCompletedReviewTask();

    const message = await idsrOruSenderHandler(medplum, {
      bot: { reference: 'Bot/123' },
      input: task,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(message?.getSegment('MSH')?.getField(9).toString()).toBe('ORU^R01');
    expect(message?.getSegment('PID')?.getField(5).toString()).toBe('Otieno^Amina');
    expect(message?.getAllSegments('OBX')).toHaveLength(1);
    expect(message?.getSegment('OBX')?.getField(3).toString()).toContain('CHOLERA');

    const communication = await medplum.searchOne('Communication', { subject: task.for?.reference });
    expect(communication).toMatchObject({ resourceType: 'Communication', status: 'completed' });
  });

  test('does not transmit before review completion', async () => {
    const { medplum, task } = await setupCompletedReviewTask('ready');

    const message = await idsrOruSenderHandler(medplum, {
      bot: { reference: 'Bot/123' },
      input: task,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(message).toBeUndefined();
    expect(await medplum.searchOne('Communication', {})).toBeUndefined();
  });
});

async function setupCompletedReviewTask(
  status: Task['status'] = 'completed'
): Promise<{ medplum: MockClient; task: Task }> {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Amina'], family: 'Otieno' }],
    birthDate: '1992-04-10',
    gender: 'female',
    identifier: [{ system: 'https://moh.health.go.ke/fhir/NamingSystem/national-id', value: '12345678' }],
  });
  const observation = await medplum.createResource<Observation>({
    resourceType: 'Observation',
    status: 'final',
    subject: createReference(patient),
    code: {
      coding: [{ system: KENYA_IDSR_CODE_SYSTEM_URL, code: 'CHOLERA', display: 'Cholera' }],
      text: 'Cholera detected',
    },
    valueCodeableConcept: {
      coding: [{ system: KENYA_IDSR_CODE_SYSTEM_URL, code: 'CHOLERA', display: 'Cholera' }],
      text: 'Positive',
    },
    issued: '2026-07-22T08:00:00Z',
  });
  const report = await medplum.createResource<DiagnosticReport>({
    resourceType: 'DiagnosticReport',
    status: 'final',
    code: { text: 'Kenya IDSR lab report' },
    subject: createReference(patient),
    result: [createReference(observation)],
    issued: '2026-07-22T08:05:00Z',
  });
  const task = await medplum.createResource<Task>({
    resourceType: 'Task',
    status,
    intent: 'order',
    priority: 'stat',
    code: {
      coding: [{ system: KENYA_IDSR_TASK_CODE_SYSTEM, code: KENYA_IDSR_REVIEW_TASK_CODE, display: 'IDSR case review' }],
    },
    focus: createReference(report),
    for: createReference(patient),
    owner: { display: 'KE-FACILITY-001' },
  });
  return { medplum, task };
}

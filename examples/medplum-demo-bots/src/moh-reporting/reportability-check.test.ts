// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, DiagnosticReport, Observation, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { KENYA_IDSR_CODE_SYSTEM_URL, KENYA_IDSR_IDENTIFIER_SYSTEM, getIdsrReviewTaskIdentifier } from './kenya-idsr';
import { handler as reportabilityCheckHandler } from './reportability-check';

describe('Kenya IDSR reportability check', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('creates a GuidanceResponse and review Task for a final reportable DiagnosticReport', async () => {
    const { medplum, report } = await setupReportableReport();

    await reportabilityCheckHandler(medplum, {
      bot: { reference: 'Bot/123' },
      input: report,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    const task = await medplum.searchOne('Task', {
      identifier: `${KENYA_IDSR_IDENTIFIER_SYSTEM}|${getIdsrReviewTaskIdentifier(report.id as string)}`,
    });
    expect(task).toMatchObject({ resourceType: 'Task', status: 'ready', priority: 'stat' });

    const guidanceResponse = await medplum.searchOne('GuidanceResponse', {
      subject: report.subject?.reference,
    });
    expect(guidanceResponse).toMatchObject({ resourceType: 'GuidanceResponse', status: 'data-required' });
  });

  test('is idempotent when re-triggered for the same report', async () => {
    const { medplum, report } = await setupReportableReport();

    const event = { bot: { reference: 'Bot/123' }, input: report, contentType: 'application/fhir+json', secrets: {} };
    await reportabilityCheckHandler(medplum, event);

    const createResourceSpy = vi.spyOn(medplum, 'createResource');
    await reportabilityCheckHandler(medplum, event);
    expect(createResourceSpy).not.toHaveBeenCalled();
  });

  test('does not create review resources for non-reportable results', async () => {
    const { medplum, patient } = await setupPatient();
    const observation = await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: { text: 'Non-reportable test' },
      valueString: 'Negative',
    });
    const report = await medplum.createResource<DiagnosticReport>({
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: { text: 'Non-reportable panel' },
      subject: createReference(patient),
      result: [createReference(observation)],
    });

    const result = await reportabilityCheckHandler(medplum, {
      bot: { reference: 'Bot/123' },
      input: report,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(result).toBe(false);
    expect(await medplum.searchOne('Task', {})).toBeUndefined();
  });
});

async function setupReportableReport(): Promise<{ medplum: MockClient; patient: Patient; report: DiagnosticReport }> {
  const { medplum, patient } = await setupPatient();
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
  return { medplum, patient, report };
}

async function setupPatient(): Promise<{ medplum: MockClient; patient: Patient }> {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Amina'], family: 'Otieno' }],
    birthDate: '1992-04-10',
    gender: 'female',
    identifier: [{ system: 'https://moh.health.go.ke/fhir/NamingSystem/national-id', value: '12345678' }],
  });
  return { medplum, patient };
}

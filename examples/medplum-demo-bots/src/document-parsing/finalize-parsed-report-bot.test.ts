// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type {
  Bundle,
  ConceptMap,
  DiagnosticReport,
  Organization,
  Provenance,
  SearchParameter,
  Task,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { LAB_CODE_MAP_IDENTIFIER_SYSTEM, NEEDS_CODE_ASSIGNMENT_TAG } from './code-mapping';
import { handler } from './finalize-parsed-report-bot';

describe('Finalize Parsed Report Bot', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('Promotes contained Observations and finalizes report', async () => {
    const medplum = new MockClient();

    // Create a preliminary DiagnosticReport with contained Observations
    const report: DiagnosticReport = await medplum.createResource({
      resourceType: 'DiagnosticReport',
      status: 'preliminary',
      code: { text: 'Laboratory Report' },
      subject: { reference: 'Patient/123' },
      contained: [
        {
          resourceType: 'Observation',
          id: 'obs-0',
          status: 'preliminary',
          code: { text: 'Glucose' },
          valueQuantity: { value: 95, unit: 'mg/dL' },
        },
        {
          resourceType: 'Observation',
          id: 'obs-1',
          status: 'preliminary',
          code: { text: 'HbA1c' },
          valueQuantity: { value: 5.7, unit: '%' },
        },
      ],
      result: [
        { reference: '#obs-0', display: 'Glucose' },
        { reference: '#obs-1', display: 'HbA1c' },
      ],
    });

    // Create Provenance for the report
    await medplum.createResource<Provenance>({
      resourceType: 'Provenance',
      target: [createReference(report)],
      recorded: new Date().toISOString(),
      agent: [
        {
          who: { reference: 'Bot/parse-bot' },
        },
      ],
    });

    // Create a completed review Task
    const task: Task = await medplum.createResource({
      resourceType: 'Task',
      status: 'completed',
      intent: 'order',
      code: {
        coding: [
          {
            system: 'http://medplum.com/fhir/CodeSystem/task-type',
            code: 'review-parsed-report',
          },
        ],
      },
      focus: createReference(report),
      owner: { reference: 'Practitioner/reviewer-1', display: 'Dr. Reviewer' },
    });

    const result = await handler(medplum, {
      bot: { reference: 'Bot/finalize-bot' },
      input: task,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    // Verify the report was finalized
    expect(result.resourceType).toBe('DiagnosticReport');
    expect(result.status).toBe('final');

    // Verify contained resources were removed (in the transaction, they get promoted)
    // The MockClient's executeBatch processes the transaction
    const finalReport = await medplum.readResource('DiagnosticReport', report.id!);
    expect(finalReport.status).toBe('final');
  });

  test('Applies reviewer code assignments and upserts ConceptMap', async () => {
    const medplum = new MockClient();

    // Performing Organization for the report (and target of the ConceptMap upsert)
    const org = await medplum.createResource<Organization>({
      resourceType: 'Organization',
      name: 'Acme Clinical Labs',
    });

    const report: DiagnosticReport = await medplum.createResource({
      resourceType: 'DiagnosticReport',
      status: 'preliminary',
      code: { text: 'Laboratory Report' },
      subject: { reference: 'Patient/123' },
      performer: [{ reference: `Organization/${org.id}` }],
      contained: [
        {
          resourceType: 'Observation',
          id: 'obs-0',
          status: 'preliminary',
          // Mapped by built-in; not tagged
          code: { text: 'Glucose', coding: [{ system: 'http://loinc.org', code: '2345-7' }] },
          valueQuantity: { value: 95, unit: 'mg/dL' },
        },
        {
          resourceType: 'Observation',
          id: 'obs-1',
          status: 'preliminary',
          code: { text: 'Custom Assay XYZ' },
          meta: { tag: [NEEDS_CODE_ASSIGNMENT_TAG] },
          valueQuantity: { value: 42, unit: 'ng/mL' },
        },
      ],
      result: [
        { reference: '#obs-0', display: 'Glucose' },
        { reference: '#obs-1', display: 'Custom Assay XYZ' },
      ],
    });

    await medplum.createResource<Provenance>({
      resourceType: 'Provenance',
      target: [createReference(report)],
      recorded: new Date().toISOString(),
      agent: [{ who: { reference: 'Bot/parse-bot' } }],
    });

    // Task.output carries the reviewer's code assignment for the unmapped test
    const task: Task = await medplum.createResource({
      resourceType: 'Task',
      status: 'completed',
      intent: 'order',
      code: {
        coding: [
          {
            system: 'http://medplum.com/fhir/CodeSystem/task-type',
            code: 'review-parsed-report',
          },
        ],
      },
      focus: createReference(report),
      owner: { reference: 'Practitioner/reviewer-1', display: 'Dr. Reviewer' },
      output: [
        {
          type: {
            text: 'Custom Assay XYZ',
            coding: [{ code: 'code-assignment' }],
          },
          valueCoding: {
            system: 'http://loinc.org',
            code: '12345-6',
            display: 'Custom Assay XYZ LOINC',
          },
        },
      ],
    });

    const result = await handler(medplum, {
      bot: { reference: 'Bot/finalize-bot' },
      input: task,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(result.status).toBe('final');

    // ConceptMap was upserted for this Organization with the new mapping
    const conceptMap = (await medplum.searchOne('ConceptMap', {
      identifier: `${LAB_CODE_MAP_IDENTIFIER_SYSTEM}|${org.id}`,
    })) as ConceptMap | undefined;
    expect(conceptMap).toBeDefined();
    const element = conceptMap?.group?.[0]?.element?.find((e) => e.code === 'custom assay xyz');
    expect(element?.target?.[0]?.code).toBe('12345-6');

    // Provenance updated with verifier agent
    const provenances = await medplum.searchResources('Provenance', {
      target: `DiagnosticReport/${report.id}`,
    });
    const verifierAgent = provenances[0].agent?.find((a) =>
      a.type?.coding?.some((c) => c.code === 'verifier')
    );
    expect(verifierAgent?.who?.reference).toBe('Practitioner/reviewer-1');
  });

  test('Refuses to finalize when unmapped observations lack code assignments', async () => {
    const medplum = new MockClient();

    const org = await medplum.createResource<Organization>({
      resourceType: 'Organization',
      name: 'Acme Clinical Labs',
    });

    const report: DiagnosticReport = await medplum.createResource({
      resourceType: 'DiagnosticReport',
      status: 'preliminary',
      code: { text: 'Laboratory Report' },
      subject: { reference: 'Patient/123' },
      performer: [{ reference: `Organization/${org.id}` }],
      contained: [
        {
          resourceType: 'Observation',
          id: 'obs-0',
          status: 'preliminary',
          code: { text: 'Mystery Test' },
          meta: { tag: [NEEDS_CODE_ASSIGNMENT_TAG] },
        },
      ],
      result: [{ reference: '#obs-0', display: 'Mystery Test' }],
    });

    // Task is completed but has no output assignments
    const task: Task = await medplum.createResource({
      resourceType: 'Task',
      status: 'completed',
      intent: 'order',
      code: {
        coding: [
          {
            system: 'http://medplum.com/fhir/CodeSystem/task-type',
            code: 'review-parsed-report',
          },
        ],
      },
      focus: createReference(report),
    });

    await expect(
      handler(medplum, {
        bot: { reference: 'Bot/finalize-bot' },
        input: task,
        contentType: 'application/fhir+json',
        secrets: {},
      })
    ).rejects.toThrow(/still lack a code assignment/);
  });

  test('Throws on non-completed Task', async () => {
    const medplum = new MockClient();

    const task: Task = await medplum.createResource({
      resourceType: 'Task',
      status: 'in-progress',
      intent: 'order',
      code: {
        coding: [
          {
            system: 'http://medplum.com/fhir/CodeSystem/task-type',
            code: 'review-parsed-report',
          },
        ],
      },
    });

    await expect(
      handler(medplum, {
        bot: { reference: 'Bot/finalize-bot' },
        input: task,
        contentType: 'application/fhir+json',
        secrets: {},
      })
    ).rejects.toThrow('Expected Task with status=completed');
  });

  test('Throws on wrong task code', async () => {
    const medplum = new MockClient();

    const task: Task = await medplum.createResource({
      resourceType: 'Task',
      status: 'completed',
      intent: 'order',
      code: {
        coding: [
          {
            system: 'http://medplum.com/fhir/CodeSystem/task-type',
            code: 'wrong-code',
          },
        ],
      },
    });

    await expect(
      handler(medplum, {
        bot: { reference: 'Bot/finalize-bot' },
        input: task,
        contentType: 'application/fhir+json',
        secrets: {},
      })
    ).rejects.toThrow('Unexpected task code: wrong-code');
  });

  test('Throws on Task without focus', async () => {
    const medplum = new MockClient();

    const task: Task = await medplum.createResource({
      resourceType: 'Task',
      status: 'completed',
      intent: 'order',
      code: {
        coding: [
          {
            system: 'http://medplum.com/fhir/CodeSystem/task-type',
            code: 'review-parsed-report',
          },
        ],
      },
    });

    await expect(
      handler(medplum, {
        bot: { reference: 'Bot/finalize-bot' },
        input: task,
        contentType: 'application/fhir+json',
        secrets: {},
      })
    ).rejects.toThrow('Task has no focus reference');
  });
});

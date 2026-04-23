// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { DiagnosticReport, Observation, Reference, Task, TaskInput } from '@medplum/fhirtypes';
import { NEEDS_CODE_ASSIGNMENT_TAG, SUGGESTED_CODING_EXTENSION_URL } from './code-mapping';

/**
 * Create Review Task Bot
 *
 * Triggered by a Subscription on DiagnosticReport creation with status=preliminary.
 * Creates a Task resource for a clinician to review the AI-extracted lab results
 * before they are finalized.
 *
 * Subscription Criteria: DiagnosticReport?status=preliminary
 */
export async function handler(medplum: MedplumClient, event: BotEvent<DiagnosticReport>): Promise<Task> {
  const report = event.input;

  if (report.status !== 'preliminary') {
    throw new Error('Expected DiagnosticReport with status=preliminary');
  }

  // Extract the parsed data Binary reference from the extension
  const parsedDataRef = report.extension?.find(
    (ext) => ext.url === 'http://medplum.com/fhir/StructureDefinition/parsed-data-binary'
  )?.valueReference;

  // Extract the parsing provider name
  const parsingProvider = report.extension?.find(
    (ext) => ext.url === 'http://medplum.com/fhir/StructureDefinition/parsing-provider'
  )?.valueString;

  const resultCount = report.result?.length ?? 0;

  // Identify contained Observations that need human code assignment
  const containedObservations = (report.contained || []).filter(
    (r): r is Observation => r.resourceType === 'Observation'
  );
  const unmappedObservations = containedObservations.filter((obs) =>
    obs.meta?.tag?.some(
      (tag) => tag.system === NEEDS_CODE_ASSIGNMENT_TAG.system && tag.code === NEEDS_CODE_ASSIGNMENT_TAG.code
    )
  );

  // Build one TaskInput per unmapped test, surfacing the LLM's suggested code (if any)
  // as a hint for the reviewer. The reviewer will respond via Task.output.
  const codeAssignmentInputs: TaskInput[] = unmappedObservations.map((obs) => {
    const suggestion = obs.extension?.find((ext) => ext.url === SUGGESTED_CODING_EXTENSION_URL)?.valueCoding;
    const input: TaskInput = {
      type: {
        coding: [
          {
            system: 'http://medplum.com/fhir/CodeSystem/task-input-type',
            code: 'code-assignment-request',
          },
        ],
        text: obs.code?.text || 'Unknown test',
      },
      valueString: obs.code?.text || 'Unknown test',
    };
    if (suggestion) {
      input.extension = [
        {
          url: SUGGESTED_CODING_EXTENSION_URL,
          valueCoding: suggestion,
        },
      ];
    }
    return input;
  });

  const needsCodeAssignment = unmappedObservations.length > 0;

  const task = await medplum.createResource<Task>({
    resourceType: 'Task',
    status: 'ready',
    intent: 'order',
    priority: needsCodeAssignment ? 'urgent' : 'routine',
    code: {
      coding: [
        {
          system: 'http://medplum.com/fhir/CodeSystem/task-type',
          code: 'review-parsed-report',
          display: 'Review Parsed Lab Report',
        },
      ],
      text: 'Review Parsed Lab Report',
    },
    description:
      `Review AI-extracted lab report (${resultCount} results) parsed by ${parsingProvider || 'unknown provider'}.` +
      (needsCodeAssignment
        ? ` ${unmappedObservations.length} test(s) require human code assignment before finalization.`
        : ' Verify contained Observations are correct before finalizing.'),
    focus: createReference(report),
    for: report.subject,
    input: [
      ...(parsedDataRef
        ? [
            {
              type: { text: 'parsedData' },
              valueReference: parsedDataRef as Reference,
            },
          ]
        : []),
      ...(parsingProvider
        ? [
            {
              type: { text: 'parsingProvider' },
              valueString: parsingProvider,
            },
          ]
        : []),
      {
        type: { text: 'resultCount' },
        valueInteger: resultCount,
      },
      {
        type: { text: 'unmappedCount' },
        valueInteger: unmappedObservations.length,
      },
      // One input per unmapped test — the reviewer's UI should render these
      // as a code-assignment form, with output values placed in Task.output.
      ...codeAssignmentInputs,
    ],
    // Assign to a doctor queue for review
    performerType: [
      {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '158965000',
            display: 'Doctor',
          },
        ],
      },
    ],
  });

  console.log(`Created review Task/${task.id} for DiagnosticReport/${report.id}`);
  return task;
}
